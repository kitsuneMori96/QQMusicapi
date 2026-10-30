/**
 * 统一响应封装.
 */

/** 统一成功响应 */
export function ok(data, meta) {
  return { code: 0, message: "ok", data, ...(meta ? { meta } : {}) };
}

/** 统一失败响应 */
export function fail(code, message, data) {
  return { code, message, data };
}
