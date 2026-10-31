/**
 * 统一信封 {code, message, data} 的 HTTP 客户端。
 *
 * 说明：这里的响应类型暂时是本地最小定义，等 src/contracts（TypeBox）落地后
 * 改为从 contracts 推导，本文件只保留传输层逻辑。
 */

import type { ApiEnvelope } from './contracts'

export class ApiError extends Error {
  readonly code: number
  readonly status: number
  readonly payload: unknown

  constructor(message: string, code: number, status: number, payload?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.payload = payload
  }
}

/** 外部 signal 取消时抛出，调用方据此静默忽略（区别于超时/网络错误）。 */
export class AbortedError extends Error {
  constructor(message = '请求已取消') {
    super(message)
    this.name = 'AbortError'
  }
}

/** 是否为取消错误：优先看 name，兼容浏览器原生 AbortError。 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** 上游「凭证失效 / 未登录」类错误码（后端会映射为 HTTP 401）。 */
const AUTH_ERROR_CODES = new Set([1000, 104400, 104401, 110001])

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || AUTH_ERROR_CODES.has(error.code))
}

type AuthErrorHandler = (message: string) => void

let authErrorHandler: AuthErrorHandler | null = null

/** 注册全局会话失效回调（由 main.ts 注入提示条 + 状态刷新）。 */
export function setAuthErrorHandler(handler: AuthErrorHandler | null): void {
  authErrorHandler = handler
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  /** 毫秒，默认 20s；状态轮询类可传更小值 */
  timeoutMs?: number
  signal?: AbortSignal
}

const DEFAULT_TIMEOUT_MS = 20_000

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    // 外部取消优先判定：调用方主动 abort 时不应被当成超时
    if (signal?.aborted) {
      throw new AbortedError()
    }
    if (controller.signal.aborted) {
      throw new ApiError(`请求超时 (${Math.round(timeoutMs / 1000)}s): ${path}`, -1, 0)
    }
    throw new ApiError(
      `网络错误: ${error instanceof Error ? error.message : String(error)}`,
      -1,
      0,
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }

  const text = await response.text()
  let envelope: ApiEnvelope<T>
  try {
    envelope = JSON.parse(text) as ApiEnvelope<T>
  } catch {
    throw new ApiError(
      `响应不是 JSON (HTTP ${response.status}): ${text.slice(0, 120)}`,
      -1,
      response.status,
      text,
    )
  }

  if (envelope.code !== 0) {
    const error = new ApiError(
      envelope.message || `code ${envelope.code}`,
      envelope.code,
      response.status,
      envelope,
    )
    // 登录流程自身的 401 不算「会话失效」，避免在登录页反复弹提示
    if (isAuthError(error) && !path.startsWith('/login/')) authErrorHandler?.(error.message)
    throw error
  }

  return (envelope as Extract<ApiEnvelope<T>, { code: 0 }>).data
}
