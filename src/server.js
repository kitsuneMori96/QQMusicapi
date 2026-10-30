/**
 * QQ Music API - 纯 JS 服务端入口 (Koa).
 *
 * 仅保留应用装配与启动逻辑; HTTP 响应/错误处理见 src/http, 凭证存储见 src/store,
 * 业务路由见 src/routes, 歌曲编排见 src/services.
 *
 * 启动配置统一由 src/config.js 解析 (CLI 参数 > 环境变量 > .env > 默认值),
 * 运行 `node src/server.js --help` 查看全部选项.
 */

// config.js 必须排在最前: 它会在其他模块加载前开启编译缓存
import { ConfigError, HELP_TEXT, loadConfig } from "./config.js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import Router from "@koa/router";

import { Client } from "./client.js";
import { Platform } from "./versioning.js";
import { VERSION } from "./version.js";
import { CredentialStore } from "./store/credentialStore.js";
import { SongService } from "./services/songService.js";
import { errorHandler } from "./http/errorHandler.js";
import { ok } from "./http/responses.js";
import { mountAll } from "./routes/index.js";

// ==================== 应用装配 ====================

function createApp(options = {}) {
  // 1. 凭证存储 (单一凭证来源)
  const store = new CredentialStore({ path: options.credentialPath });

  // 2. Client 注入 store, credential 由 store 驱动
  const client = new Client({
    platform: options.platform ?? Platform.ANDROID,
    devicePath: options.devicePath,
    credentialStore: store,
  });

  // 3. 业务编排服务
  const songService = new SongService(client, {
    maxDownloadBytes: options.downloadMaxBytes ?? 0,
  });

  const app = new Koa();
  app.use(errorHandler);
  app.use(bodyParser({ jsonLimit: "1mb" }));

  // 4. 健康检查 + 首页
  const root = new Router();
  root.get("/health", (ctx) => {
    ctx.body = ok({
      status: "ok",
      version: VERSION,
      time: new Date().toISOString(),
      loggedIn: store.credential.isLoggedIn(),
      musicid: store.credential.musicid || null,
    });
  });

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const PUBLIC_DIR = join(__dirname, "public");
  const INDEX_HTML_PATH = join(PUBLIC_DIR, "index.html");
  const LOGIN_HTML_PATH = join(PUBLIC_DIR, "login.html");
  let indexHtmlCache = null;
  let loginHtmlCache = null;
  root.get("/", (ctx) => {
    ctx.type = "text/html; charset=utf-8";
    if (!indexHtmlCache) {
      indexHtmlCache = existsSync(INDEX_HTML_PATH)
        ? readFileSync(INDEX_HTML_PATH, "utf-8")
        : "<h1>QQ Music API</h1><p>index.html not found at " + INDEX_HTML_PATH + "</p>";
    }
    ctx.body = indexHtmlCache;
  });
  root.get("/login", (ctx) => {
    ctx.type = "text/html; charset=utf-8";
    if (!loginHtmlCache) {
      loginHtmlCache = existsSync(LOGIN_HTML_PATH)
        ? readFileSync(LOGIN_HTML_PATH, "utf-8")
        : "<h1>QQ Music Login</h1><p>login.html not found at " + LOGIN_HTML_PATH + "</p>";
    }
    ctx.body = loginHtmlCache;
  });
  app.use(root.routes());

  // 5. 业务路由
  mountAll(app, { client, store, songService });

  return Object.assign(app, { client, store, songService });
}

// ==================== 启动入口 ====================

const PLATFORM_ENUM = {
  android: Platform.ANDROID,
  desktop: Platform.DESKTOP,
  web: Platform.WEB,
};

function openBrowser(url) {
  const candidates =
    process.platform === "win32"
      ? [["rundll32", ["url.dll,FileProtocolHandler", url]]]
      : [["xdg-open", [url]], ["wslview", [url]], ["open", [url]]];
  for (const [cmd, args] of candidates) {
    try {
      const child = spawn(cmd, args, { stdio: "ignore", detached: true });
      child.on("error", () => {});
      child.unref();
      return true;
    } catch {
      // 尝试下一种方式
    }
  }
  return false;
}

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`[qqmusic-api] ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
  if (config.help) {
    console.log(HELP_TEXT);
    return;
  }

  const app = createApp({
    devicePath: config.devicePath,
    credentialPath: config.credentialPath,
    platform: PLATFORM_ENUM[config.platform],
  });

  const server = app.listen(config.port, config.host, () => {
    const shownHost = config.host === "0.0.0.0" ? "localhost" : config.host;
    const url = `http://${shownHost}:${config.port}`;
    console.log(`[qqmusic-api] listening on ${url}`);
    console.log(`[qqmusic-api] platform        : ${config.platform}`);
    console.log(`[qqmusic-api] device path     : ${config.devicePath}`);
    console.log(`[qqmusic-api] credential path : ${config.credentialPath}`);
    if (!app.store.credential.isLoggedIn()) {
      console.log(`[qqmusic-api] 提示: 当前未登录, 访问 ${url}/login 扫码登录, 或 PUT /login/credential 写入凭证`);
    }
    if (config.open) openBrowser(url);
  });

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`[qqmusic-api] 端口 ${config.port} 已被占用, 请用 --port 指定其他端口`);
    } else {
      console.error("[qqmusic-api]", e);
    }
    process.exit(1);
  });

  // 优雅退出: 停止接收新连接, 等待在途请求结束, 超时强制退出
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[qqmusic-api] 收到 ${signal}, 正在关闭...`);
    server.close(() => process.exit(0));
    setTimeout(() => {
      console.warn("[qqmusic-api] 10s 内未结束在途请求, 强制退出");
      process.exit(0);
    }, 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

export { createApp };
