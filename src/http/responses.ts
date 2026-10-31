/**
 * 统一响应封装.
 */

import type { ApiOk } from "../contracts/common.ts";

/** 统一成功响应 */
export function ok<T>(data: T, meta?: unknown): ApiOk<T> {
  return { code: 0, message: "ok", data, ...(meta !== undefined ? { meta } : {}) };
}

/** 统一失败响应 */
export function fail(code: number, message: string, data?: unknown) {
  return { code, message, ...(data !== undefined ? { data } : {}) };
}
