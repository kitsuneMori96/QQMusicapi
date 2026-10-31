/**
 * QQ Music API - 服务端入口 (Fastify).
 *
 * 仅保留应用装配与启动逻辑; 响应/错误处理见 src/http, 凭证存储见 src/store,
 * 业务路由见 src/routes, 歌曲编排见 src/services, 接口契约见 src/contracts.
 *
 * 启动配置统一由 src/config.js 解析 (CLI 参数 > 环境变量 > .env > 默认值),
 * 运行 `node src/server.ts --help` 查看全部选项.
 */

// config.js 必须排在最前: 它会在其他模块加载前开启编译缓存
import { ConfigError, HELP_TEXT, loadConfig } from "./config.js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";

import { Client } from "./client.js";
import { Platform } from "./versioning.js";
import { VERSION } from "./version.js";
import { CredentialStore } from "./store/credentialStore.js";
import { SongService } from "./services/songService.js";
import { registerErrorHandler } from "./http/errorHandler.ts";
import { ok, fail } from "./http/responses.ts";
import { mountAll } from "./routes/index.ts";
import type { HealthData } from "./contracts/health.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");
const WEB_DIST = join(__dirname, "..", "web", "dist");

// 只对这些前缀返回 JSON 404, 其余 GET(浏览器导航) 交给 SPA 回退
const API_PREFIXES = ["/health", "/song", "/user", "/login/", "/vendor"];

const VENDOR_FILES: Record<string, string> = {
  "APlayer.min.js": "application/javascript; charset=utf-8",
  "APlayer.min.css": "text/css; charset=utf-8",
};

function readPage(path: string, reply: FastifyReply) {
  reply
    .header("Cache-Control", "no-store")
    .type("text/html; charset=utf-8")
    .send(readFileSync(path, "utf-8"));
}

// ==================== 应用装配 ====================

export interface AppOptions {
  credentialPath?: string;
  devicePath?: string;
  platform?: string;
  downloadMaxBytes?: number;
  /** 测试注入: 覆盖默认实例 */
  client?: any;
  store?: any;
  songService?: any;
}

export type App = FastifyInstance & { client: any; store: any; songService: any };

export function createApp(options: AppOptions = {}): App {
  // 1. 凭证存储 (单一凭证来源)
  const store = options.store ?? new CredentialStore({ path: options.credentialPath });

  // 2. Client 注入 store, credential 由 store 驱动
  const client =
    options.client ??
    new Client({
      platform: options.platform ?? Platform.ANDROID,
      devicePath: options.devicePath,
      credentialStore: store,
    });

  // 3. 业务编排服务
  const songService =
    options.songService ??
    new SongService(client, { maxDownloadBytes: options.downloadMaxBytes ?? 0 });

  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 }) as unknown as App;
  registerErrorHandler(app);

  // 4. 健康检查
  app.get("/health", async () =>
    ok<HealthData>({
      status: "ok",
      version: VERSION,
      time: new Date().toISOString(),
      loggedIn: store.credential.isLoggedIn(),
      musicid: store.credential.musicid || null,
    }),
  );

  // 5. 页面与静态资源: 有 web/dist 走 Vue 构建产物, 否则回退旧的 src/public
  const useSpa = existsSync(join(WEB_DIST, "index.html"));
  const indexPage = useSpa ? join(WEB_DIST, "index.html") : join(PUBLIC_DIR, "index.html");
  const loginPage = useSpa ? join(WEB_DIST, "index.html") : join(PUBLIC_DIR, "login.html");

  const servePage = (path: string) => (_req: FastifyRequest, reply: FastifyReply) => {
    if (!existsSync(path)) {
      reply.code(404).send(fail(404, "Not Found"));
      return;
    }
    readPage(path, reply);
  };

  app.get("/", servePage(indexPage));
  app.get("/login", servePage(loginPage));

  if (useSpa) {
    // wildcard:false -> 启动时为已存在的构建产物注册精确路由, 未命中走 404 处理(SPA 回退)
    app.register(fastifyStatic, {
      root: WEB_DIST,
      prefix: "/",
      wildcard: false,
      index: false,
      decorateReply: false,
    });
  }

  // 前端第三方库(APlayer)内置托管: 用户网络常无法访问 jsdelivr
  app.get<{ Params: { name: string } }>("/vendor/:name", async (req, reply) => {
    const name = req.params.name;
    const mime = VENDOR_FILES[name];
    const dirs = [join(WEB_DIST, "vendor"), join(PUBLIC_DIR, "vendor")];
    const path = mime ? dirs.map((d) => join(d, name)).find((p) => existsSync(p)) : undefined;
    if (!mime || !path) {
      reply.code(404).send(fail(404, "Not Found"));
      return;
    }
    reply.header("Cache-Control", "public, max-age=604800").type(mime).send(readFileSync(path));
  });

  // 6. 业务路由
  mountAll(app, { client, store, songService });

  // 7. 未命中: SPA 深链回退, 其余返回统一 JSON 404
  app.setNotFoundHandler((req, reply) => {
    const url = (req.raw.url ?? "").split("?")[0];
    const isApi = API_PREFIXES.some((p) => url === p || url.startsWith(p));
    const wantsHtml = String(req.headers.accept ?? "").includes("text/html");
    if (useSpa && req.method === "GET" && wantsHtml && !isApi && existsSync(indexPage)) {
      readPage(indexPage, reply);
      return;
    }
    reply.code(404).send(fail(404, "Not Found"));
  });

  return Object.assign(app, { client, store, songService });
}

// ==================== 启动入口 ====================

const PLATFORM_ENUM: Record<string, string> = {
  android: Platform.ANDROID,
  desktop: Platform.DESKTOP,
  web: Platform.WEB,
};

function openBrowser(url: string): boolean {
  const candidates: Array<[string, string[]]> =
    process.platform === "win32"
      ? [["rundll32", ["url.dll,FileProtocolHandler", url]]]
      : [
          ["xdg-open", [url]],
          ["wslview", [url]],
          ["open", [url]],
        ];
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

async function main(): Promise<void> {
  let config: ReturnType<typeof loadConfig>;
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

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (e: any) {
    if (e?.code === "EADDRINUSE") {
      console.error(`[qqmusic-api] 端口 ${config.port} 已被占用, 请用 --port 指定其他端口`);
    } else {
      console.error("[qqmusic-api]", e);
    }
    process.exit(1);
  }

  const shownHost = config.host === "0.0.0.0" ? "localhost" : config.host;
  const url = `http://${shownHost}:${config.port}`;
  console.log(`[qqmusic-api] listening on ${url}`);
  console.log(`[qqmusic-api] platform        : ${config.platform}`);
  console.log(`[qqmusic-api] device path     : ${config.devicePath}`);
  console.log(`[qqmusic-api] credential path : ${config.credentialPath}`);
  if (!app.store.credential.isLoggedIn()) {
    console.log(
      `[qqmusic-api] 提示: 当前未登录, 访问 ${url}/login 扫码登录, 或 PUT /login/credential 写入凭证`,
    );
  }
  if (config.open) openBrowser(url);

  // 优雅退出: 停止接收新连接, 等待在途请求结束, 超时强制退出
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[qqmusic-api] 收到 ${signal}, 正在关闭...`);
    setTimeout(() => {
      console.warn("[qqmusic-api] 10s 内未结束在途请求, 强制退出");
      process.exit(0);
    }, 10_000).unref();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
