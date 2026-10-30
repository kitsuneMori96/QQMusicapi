/**
 * 统一启动配置.
 *
 * 优先级: CLI 参数 > 进程环境变量 > .env 文件 > 默认值.
 *
 * 注意: 本模块必须是 server.js 的第一个 import.
 * 顶层会开启 Node 模块编译缓存 (Node >= 22.1), 只对其后加载的模块生效,
 * 可显著降低重复冷启动耗时.
 */

import { existsSync, readFileSync } from "node:fs";
import module from "node:module";
import { resolve } from "node:path";

try {
  if (typeof module.enableCompileCache === "function") {
    module.enableCompileCache();
  }
} catch {
  // 老版本 Node 或缓存目录不可写时忽略
}

export class ConfigError extends Error {}

const PLATFORMS = ["android", "desktop", "web"];

export const HELP_TEXT = `QQ Music API - 启动参数

用法: node src/server.js [选项]

选项:
  -p, --port <n>         监听端口 (默认 3300)
  -H, --host <addr>      监听地址 (默认 0.0.0.0)
      --platform <p>     请求平台: android | desktop | web (默认 android)
      --device <path>    设备信息持久化路径 (默认 ./device.json)
      --credential <p>   凭证持久化路径 (默认 ./credential.json)
      --env-file <path>  指定 .env 文件 (默认读取 ./.env)
      --open             启动后尝试打开浏览器
  -h, --help             显示本帮助

环境变量 (同名): PORT / HOST / PLATFORM / DEVICE_PATH / CREDENTIAL_PATH
环境变量与 .env 文件的键值对同格式, 也可写入 .env 文件.`;

/** 解析 KEY=VALUE 格式的 .env 文件, 已存在的进程环境变量优先 */
function applyDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/** 解析命令行参数, 支持 `--key value` 与 `--key=value` 两种写法 */
function parseArgv(argv) {
  const alias = {
    "-p": "port",
    "-H": "host",
    "-h": "help",
  };
  const known = new Set([
    "port",
    "host",
    "platform",
    "device",
    "credential",
    "env-file",
    "open",
    "help",
  ]);
  const flags = {};
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (arg.startsWith("--")) arg = arg.slice(2);
    else if (arg.startsWith("-") && arg.length > 1) arg = alias[arg] ?? arg;
    else {
      positional.push(arg);
      continue;
    }

    let key = arg;
    let value;
    const eq = arg.indexOf("=");
    if (eq >= 0) {
      key = arg.slice(0, eq);
      value = arg.slice(eq + 1);
    }

    if (!known.has(key)) {
      throw new ConfigError(`未知参数: --${key}\n\n${HELP_TEXT}`);
    }
    if (key === "open") {
      flags.open = true;
      continue;
    }
    if (key === "help") {
      flags.help = true;
      continue;
    }
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined) {
        throw new ConfigError(`参数 --${key} 缺少取值`);
      }
    }
    flags[key] = value;
  }
  return flags;
}

/**
 * 组装最终启动配置.
 * @param {string[]} argv process.argv.slice(2)
 */
export function loadConfig(argv = process.argv.slice(2)) {
  const flags = parseArgv(argv);
  if (flags.help) return { help: true };

  if (flags["env-file"]) {
    applyDotEnv(resolve(flags["env-file"]));
  } else {
    applyDotEnv(resolve(".env"));
  }

  const pick = (flagName, envName, fallback) =>
    flags[flagName] ?? process.env[envName] ?? fallback;

  const host = pick("host", "HOST", "0.0.0.0");
  const platform = pick("platform", "PLATFORM", "android");
  const devicePath = pick("device", "DEVICE_PATH", "./device.json");
  const credentialPath = pick("credential", "CREDENTIAL_PATH", "./credential.json");
  const open = flags.open === true || /^(1|true)$/i.test(process.env.OPEN_BROWSER ?? "");

  const port = Number(pick("port", "PORT", "3300"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`无效端口: ${pick("port", "PORT", "3300")} (应为 1-65535 的整数)`);
  }
  if (!PLATFORMS.includes(platform)) {
    throw new ConfigError(`无效平台: ${platform} (应为 ${PLATFORMS.join(" | ")})`);
  }
  if (!host) {
    throw new ConfigError("HOST 不能为空");
  }

  return { port, host, platform, devicePath, credentialPath, open };
}
