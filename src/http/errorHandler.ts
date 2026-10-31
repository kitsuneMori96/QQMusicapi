/**
 * Fastify 错误处理: 把抛出的异常统一序列化为 { code, message, data } JSON.
 *
 * 状态码解析优先级 (与原 Koa 中间件一致):
 *   1. 异常自带 statusCode/status —— 4xx 原样透出
 *   2. 按 BaseApiException 子类型给语义默认 (凭证类 401/403、限流 429、网络/上游 502)
 *   3. 其余未知错误 -> 500 (并打印堆栈)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fail } from "./responses.ts";
import {
  CredentialExpiredError,
  CredentialInvalidError,
  CredentialRefreshError,
  NetworkError,
  RatelimitedError,
} from "../exceptions.js";

export interface HttpError extends Error {
  statusCode?: number;
  data?: unknown;
}

/** 业务代码里替代 ctx.throw 的构造器 */
export function httpError(statusCode: number, message: string, data?: unknown): HttpError {
  const err = new Error(message) as HttpError;
  err.statusCode = statusCode;
  if (data !== undefined) err.data = data;
  return err;
}

/** 无自带状态的领域异常 -> 合适的 HTTP 状态码 */
function defaultStatus(err: any): number {
  if (err instanceof RatelimitedError) return 429;
  if (err instanceof CredentialExpiredError || err instanceof CredentialInvalidError) return 401;
  if (err instanceof CredentialRefreshError) return 403;
  if (err instanceof NetworkError) return 502;
  return 500;
}

/** 纯函数: 异常 -> { 状态码, 统一信封 }. 便于单测, 与框架解耦. */
export function toErrorResponse(err: any): {
  status: number;
  body: ReturnType<typeof fail>;
} {
  const explicit = err?.statusCode ?? err?.status;
  const status =
    typeof explicit === "number" && explicit >= 400 ? explicit : defaultStatus(err);
  // Fastify/Node 内置错误常带字符串 code (如 FST_ERR_VALIDATION), 只保留数字错误码
  const code = typeof err?.code === "number" ? err.code : status;
  return {
    status,
    body: fail(code, err?.message || "Internal Server Error", err?.data),
  };
}

/** 把 Ajv 校验错误描述成「位置 路径 原因」, 位置取 Fastify 传入的 dataVar */
function describeSchemaError(dataVar: string, e: {
  keyword?: string;
  instancePath?: string;
  message?: string;
  params?: { missingProperty?: string };
}): string {
  if (e.keyword === "required" && e.params?.missingProperty) {
    return `${dataVar}.${e.params.missingProperty} 必填`;
  }
  const path = e.instancePath ? `${dataVar}${e.instancePath}` : dataVar;
  return `${path} ${e.message ?? ""}`.trim();
}

export function registerErrorHandler(app: FastifyInstance): void {
  // schema 校验失败也走统一信封, 并给出中文前缀
  app.setSchemaErrorFormatter((errors, dataVar) => {
    const detail = errors.map((e) => describeSchemaError(dataVar, e)).join("; ");
    return httpError(400, `参数校验失败: ${detail}`);
  });

  app.setErrorHandler((err, _req: FastifyRequest, reply: FastifyReply) => {
    const { status, body } = toErrorResponse(err);
    reply.code(status).send(body);
    if (status >= 500) {
      console.error("[qqmusic-api]", err);
    }
  });
}
