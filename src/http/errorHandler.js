/**
 * Koa 错误处理中间件: 把抛出的异常统一序列化为 { code, message, data } JSON.
 *
 * 状态码解析优先级:
 *   1. 异常自带 statusCode/status (Koa ctx.throw、HTTPError) —— 4xx 原样透出
 *   2. 按 BaseApiException 子类型给语义默认 (凭证类 401/403、限流 429、网络/上游 502)
 *   3. 其余未知错误 -> 500 (并打印堆栈)
 */

import { fail } from "./responses.js";
import {
  CredentialExpiredError,
  CredentialInvalidError,
  CredentialRefreshError,
  NetworkError,
  RatelimitedError,
} from "../exceptions.js";

/** 无自带状态的领域异常 -> 合适的 HTTP 状态码 */
function defaultStatus(err) {
  if (err instanceof RatelimitedError) return 429;
  if (err instanceof CredentialExpiredError || err instanceof CredentialInvalidError) return 401;
  if (err instanceof CredentialRefreshError) return 403;
  if (err instanceof NetworkError) return 502;
  return 500;
}

export async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (e) {
    const err = e;
    const explicit = err.statusCode ?? err.status;
    const status =
      typeof explicit === "number" && explicit >= 400 ? explicit : defaultStatus(err);
    ctx.status = status;
    ctx.body = fail(err.code ?? status, err.message || "Internal Server Error", err.data);
    if (status >= 500) {
      console.error("[qqmusic-api]", err);
    }
  }
}
