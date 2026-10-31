/**
 * API 契约: 统一信封.
 *
 * 所有 JSON 端点返回 `{ code, message, data }`:
 *   - 成功:   code === 0, data 为业务数据
 *   - 失败:   HTTP 4xx/5xx, code 为错误码(缺省等于状态码), data 为可选上下文
 *
 * 前端 `import type` 引用, 构建时被完全擦除, 不会打进包.
 */

export interface ApiOk<T> {
  code: 0;
  message: string;
  data: T;
  meta?: unknown;
}

export interface ApiFail {
  code: number;
  message: string;
  data?: unknown;
}

export type ApiEnvelope<T> = ApiOk<T> | ApiFail;

/** 上游 QQ 返回中未建模的字段统一保留 */
export type UnknownRecord = Record<string, unknown>;
