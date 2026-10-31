import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  HEALTH_FOCUS_MIN_GAP_MS,
  HEALTH_INTERVAL_MS,
  HEALTH_RETRY_MS,
  useStatusStore,
} from './status'

function healthResponse(loggedIn = true): Response {
  return {
    status: 200,
    text: async () =>
      JSON.stringify({
        code: 0,
        message: 'ok',
        data: { status: 'ok', version: 'test', time: '', loggedIn, musicid: 1 },
      }),
  } as unknown as Response
}

const flush = () => vi.advanceTimersByTimeAsync(0)

describe('status store polling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
    vi.useFakeTimers()
  })

  afterEach(() => {
    delete (document as { hidden?: boolean }).hidden
    vi.useRealTimers()
  })

  it('在线时每 30s 自动探测一次', async () => {
    const fetchMock = vi.fn(async () => healthResponse())
    vi.stubGlobal('fetch', fetchMock)
    const store = useStatusStore()

    store.start()
    await flush()
    expect(store.phase).toBe('online')
    expect(store.loggedIn).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS - 10)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    store.stop()
  })

  it('离线按 5/10/20s 退避，恢复后回到 30s 间隔', async () => {
    let healthy = false
    const fetchMock = vi.fn(async () => {
      if (!healthy) throw new TypeError('network down')
      return healthResponse()
    })
    vi.stubGlobal('fetch', fetchMock)
    const store = useStatusStore()

    store.start()
    await flush()
    expect(store.phase).toBe('offline')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const failIndex = [1, 2, 3]
    for (const i of failIndex) {
      const delay = HEALTH_RETRY_MS[i - 1] ?? 0
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(fetchMock).toHaveBeenCalledTimes(i)
      await vi.advanceTimersByTimeAsync(1)
      await flush()
      expect(fetchMock).toHaveBeenCalledTimes(i + 1)
      expect(store.phase).toBe('offline')
    }

    healthy = true
    await vi.advanceTimersByTimeAsync(HEALTH_RETRY_MS[3] ?? 0)
    await flush()
    expect(store.phase).toBe('online')

    const afterRecover = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS - 1)
    expect(fetchMock.mock.calls.length).toBe(afterRecover)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(fetchMock.mock.calls.length).toBe(afterRecover + 1)

    store.stop()
  })

  it('窗口聚焦时提前探测，但 3s 内不重复', async () => {
    const fetchMock = vi.fn(async () => healthResponse())
    vi.stubGlobal('fetch', fetchMock)
    const store = useStatusStore()

    store.start()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(HEALTH_FOCUS_MIN_GAP_MS - 1000)
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    store.stop()
  })

  it('页面隐藏时暂停，回到前台立即探测', async () => {
    const fetchMock = vi.fn(async () => healthResponse())
    vi.stubGlobal('fetch', fetchMock)
    const store = useStatusStore()
    store.start()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS * 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    store.stop()
    delete (document as { hidden?: boolean }).hidden
  })

  it('stop 之后不再探测', async () => {
    const fetchMock = vi.fn(async () => healthResponse())
    vi.stubGlobal('fetch', fetchMock)
    const store = useStatusStore()
    store.start()
    await flush()
    store.stop()

    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS * 3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.polling).toBe(false)
  })
})
