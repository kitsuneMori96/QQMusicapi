import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  isAbortError,
  isAuthError,
  probeDirectLink,
  request,
  requestBinary,
  setAuthErrorHandler,
} from './http'

function envelopeResponse(code: number, message: string, status = 200): Response {
  return {
    status,
    text: async () => JSON.stringify({ code, message, data: null }),
  } as unknown as Response
}

/** 可分块读取的二进制响应，用于验证下载进度 */
function chunkedResponse(
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
): Response {
  let index = 0
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    body: {
      getReader: () => ({
        read: async () => {
          const chunk = chunks[index++]
          return chunk ? { done: false, value: chunk } : { done: true, value: undefined }
        },
      }),
    },
    blob: async () => new Blob(chunks as BlobPart[]),
  } as unknown as Response
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('http client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    setAuthErrorHandler(null)
  })

  it('外部取消抛 AbortError，不当成超时', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError')
      }),
    )

    const error = await request('/api', { signal: controller.signal }).catch((e: unknown) => e)
    expect(isAbortError(error)).toBe(true)
  })

  it('超时仍报请求超时', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: unknown, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'))
            })
          }),
      ),
    )

    const pending = request('/api', { timeoutMs: 50 }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(60)
    const error = await pending

    expect(isAbortError(error)).toBe(false)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('请求超时')
  })

  it('识别凭证失效类错误', () => {
    expect(isAuthError(new ApiError('凭证已过期', 1000, 401))).toBe(true)
    expect(isAuthError(new ApiError('未登录', 110001, 200))).toBe(true)
    expect(isAuthError(new ApiError('无权限', 403, 403))).toBe(false)
    expect(isAuthError(new Error('x'))).toBe(false)
  })

  it('业务请求 401 时通知全局守卫，登录接口不算', async () => {
    const handler = vi.fn()
    setAuthErrorHandler(handler)
    vi.stubGlobal('fetch', vi.fn(async () => envelopeResponse(1000, '凭证已过期', 401)))

    await expect(request('/song/urls')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledWith('凭证已过期')

    await expect(request('/login/status')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('requestBinary', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    setAuthErrorHandler(null)
  })

  it('逐块上报进度，total 取 Content-Length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        chunkedResponse([bytes('aaa'), bytes('bbb'), bytes('ccc')], {
          'content-length': '9',
          'content-disposition': "attachment; filename*=UTF-8''%E6%99%B4%E5%A4%A9.flac",
        }),
      ),
    )

    const progress: Array<{ received: number; total: number }> = []
    const result = await requestBinary('/song/download?mid=x&type=F000', {
      onProgress: (p) => progress.push(p),
    })

    expect(progress).toEqual([
      { received: 3, total: 9 },
      { received: 6, total: 9 },
      { received: 9, total: 9 },
    ])
    expect(result.filename).toBe('晴天.flac')
    expect(result.total).toBe(9)
    expect(result.blob.size).toBe(9)
  })

  it('没有 Content-Length 时进度 total 为 0，返回值退回实际大小', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => chunkedResponse([bytes('aaaa'), bytes('bbbb')])))

    const progress: Array<{ received: number; total: number }> = []
    const result = await requestBinary('/song/download', { onProgress: (p) => progress.push(p) })

    expect(progress.map((p) => p.total)).toEqual([0, 0])
    expect(progress.at(-1)?.received).toBe(8)
    expect(result.total).toBe(8)
    expect(result.filename).toMatch(/^download-\d+$/)
  })

  it('取流阶段不受超时影响（超时只约束响应头）', async () => {
    vi.useFakeTimers()
    let release: (chunk: Uint8Array) => void = () => {}
    let started = false
    const reader = {
      read: () => {
        if (!started) {
          started = true
          return new Promise<{ done: boolean; value?: Uint8Array }>((resolve, reject) => {
            release = (chunk: Uint8Array) => resolve({ done: false, value: chunk })
            // 真实的 fetch 会在 signal 中止时掐断取流，这里照做才能验证计时器已清除
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'))
            })
          })
        }
        return Promise.resolve({ done: true as const, value: undefined })
      },
    }
    let init: RequestInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: unknown, requestInit: RequestInit) => {
        init = requestInit
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          body: { getReader: () => reader },
          blob: async () => new Blob(),
        } as unknown as Response
      }),
    )

    const pending = requestBinary('/song/download', { timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(600_000)
    release(bytes('payload'))

    await expect(pending).resolves.toMatchObject({ total: 7 })
    vi.useRealTimers()
  })

  it('下载 401 同样触发会话失效回调', async () => {
    const handler = vi.fn()
    setAuthErrorHandler(handler)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ code: 104401, message: '凭证已过期' }),
      })),
    )

    await expect(requestBinary('/song/download')).rejects.toMatchObject({
      message: '凭证已过期',
      code: 104401,
      status: 401,
    })
    expect(handler).toHaveBeenCalledWith('凭证已过期')
  })

  it('错误体不是 JSON 时退回状态码提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => '<html>boom</html>',
      })),
    )

    await expect(requestBinary('/song/download')).rejects.toMatchObject({
      message: '下载失败 (HTTP 500)',
      code: -1,
      status: 500,
    })
  })
})

describe('probeDirectLink', () => {
  const CDN = 'http://aqqmusic.tc.qq.com/O800002zOFB80Sxo0q.ogg?vkey=x'

  it('HEAD 用简单方法发一次请求，200 视为可取', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
      ok: true,
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(probeDirectLink(CDN)).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'HEAD' })
  })

  it('CDN 返回 404 时判为不可取', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    )

    await expect(probeDirectLink(CDN)).resolves.toBe(false)
  })

  it('网络错误 / 超时 / CORS 读不到响应时放行，不误杀可能能播的档位', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    await expect(probeDirectLink(CDN)).resolves.toBe(true)
  })
})

