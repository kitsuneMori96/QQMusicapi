import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, isAbortError, isAuthError, request, setAuthErrorHandler } from './http'

function envelopeResponse(code: number, message: string, status = 200): Response {
  return {
    status,
    text: async () => JSON.stringify({ code, message, data: null }),
  } as unknown as Response
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
