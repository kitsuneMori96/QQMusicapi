import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isAbortError, request } from './http'

describe('http client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
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
})
