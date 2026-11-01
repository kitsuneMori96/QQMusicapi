/**
 * 统一信封 {code, message, data} 的 HTTP 客户端，外加二进制下载通道。
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

/** 登录流程自身的 401 不算「会话失效」，避免在登录页反复弹提示 */
function reportIfAuthExpired(error: ApiError, path: string): void {
  if (isAuthError(error) && !path.startsWith('/login/')) authErrorHandler?.(error.message)
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  /** 毫秒，默认 20s；状态轮询类可传更小值 */
  timeoutMs?: number
  signal?: AbortSignal
}

const DEFAULT_TIMEOUT_MS = 20_000
/** 下载要等上游取流 + 服务端 tagging，头部到达的预算给得宽一些 */
const DEFAULT_BINARY_TIMEOUT_MS = 60_000

/**
 * 发起请求并把超时与外部取消区分开：调用方主动 abort 不应被当成超时。
 * 计时器只覆盖到响应头到达，响应体取流阶段不受超时影响（大文件下载会被误杀）。
 */
async function fetchWithTimeout(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    return await fetch(path, { ...init, signal: controller.signal })
  } catch (error) {
    if (signal?.aborted) throw new AbortedError()
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
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options

  const response = await fetchWithTimeout(
    path,
    {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    timeoutMs,
    signal,
  )

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
    reportIfAuthExpired(error, path)
    throw error
  }

  return (envelope as Extract<ApiEnvelope<T>, { code: 0 }>).data
}

/** 下载进度；`total` 为 0 表示响应没给 Content-Length，无法算百分比 */
export interface DownloadProgress {
  received: number
  total: number
}

export interface BinaryOptions {
  signal?: AbortSignal
  timeoutMs?: number
  onProgress?: (progress: DownloadProgress) => void
}

/**
 * 解析 Content-Disposition 里的文件名。
 * RFC 5987 的 filename*=UTF-8'' 优先于旧式 filename=。
 */
export function parseContentDispositionFilename(disposition: string | null): string {
  if (!disposition) return ''

  const encoded = disposition.match(/filename\*\s*=\s*([^;]+)/i)?.[1]
  if (encoded) {
    const raw = encoded.trim().replace(/^UTF-8''/i, '').replace(/^"|"$/g, '')
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }

  const plain = disposition.match(/filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i)
  return (plain?.[1] ?? plain?.[2] ?? '').trim()
}

/**
 * 二进制通道：错误仍是后端信封（{code,message}），据此抛 ApiError 并触发会话失效回调。
 * 响应体可流式读取时逐块上报进度，否则整块取 blob。
 */
export async function requestBinary(
  path: string,
  options: BinaryOptions = {},
): Promise<{ blob: Blob; filename: string; total: number }> {
  const { signal, timeoutMs = DEFAULT_BINARY_TIMEOUT_MS, onProgress } = options

  const response = await fetchWithTimeout(path, { method: 'GET' }, timeoutMs, signal)

  if (!response.ok) {
    let message = ''
    let code = -1
    try {
      const envelope = JSON.parse(await response.text()) as { code?: number; message?: string }
      message = envelope.message ?? ''
      code = envelope.code ?? -1
    } catch {
      // 非 JSON 错误体：退回状态码提示
    }
    const error = new ApiError(message || `下载失败 (HTTP ${response.status})`, code, response.status)
    reportIfAuthExpired(error, path)
    throw error
  }

  const blob = await readBlobWithProgress(response, onProgress)
  const total = Number(response.headers.get('content-length')) || 0
  const filename =
    parseContentDispositionFilename(response.headers.get('content-disposition')) ||
    `download-${Date.now()}`

  return { blob, filename, total: total || blob.size }
}

async function readBlobWithProgress(
  response: Response,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<Blob> {
  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body?.getReader?.()

  if (!reader) {
    const blob = await response.blob()
    onProgress?.({ received: blob.size, total: total || blob.size })
    return blob
  }

  const chunks: BlobPart[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    received += value.byteLength
    onProgress?.({ received, total })
  }

  return new Blob(chunks)
}
