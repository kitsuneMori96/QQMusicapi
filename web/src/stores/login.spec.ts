import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AUTHCODE_COUNTDOWN_S, QR_POLL_INTERVAL_MS, useLoginStore } from './login'

interface MockState {
  qrEvents: number[]
  sendEvent: 'SEND' | 'CAPTCHA' | 'FREQUENCY'
}

function jsonResponse(data: unknown, code = 0): Response {
  return {
    status: 200,
    text: async () => JSON.stringify({ code, message: code === 0 ? 'ok' : 'error', data }),
  } as unknown as Response
}

function mockApi(state: MockState) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (url === '/login/status') {
      return jsonResponse({ loggedIn: false, expired: false, musicid: null, file: '/tmp/credential.json' })
    }
    if (url === '/login/qrcode') {
      return jsonResponse({ type: 'qq', mime: 'image/png', identifier: 'qr-id-1', data: 'QUJD' })
    }
    if (url === '/login/checkQrcode') {
      return jsonResponse({ event: state.qrEvents.shift() ?? 1, credential: null })
    }
    if (url === '/login/sendAuthcode') {
      return jsonResponse({ event: state.sendEvent })
    }
    if (url === '/health') {
      return jsonResponse({ status: 'ok', version: 'test', time: '', loggedIn: false, musicid: null })
    }
    if (url === '/user/self') {
      return jsonResponse({ data: { nick: '测试用户' } })
    }
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls }
}

describe('login store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
    vi.useFakeTimers()
  })

  it('二维码加载后进入 WAIT 并每 2s 轮询，DONE 后停止并刷新会话', async () => {
    const state: MockState = { qrEvents: [2, 0], sendEvent: 'SEND' }
    const { fetchMock } = mockApi(state)
    const store = useLoginStore()

    await store.loadQr()
    expect(store.qrEvent).toBe('WAIT')
    expect(store.identifier).toBe('qr-id-1')
    expect(store.qrImageUrl).toBe('data:image/png;base64,QUJD')

    await vi.advanceTimersByTimeAsync(QR_POLL_INTERVAL_MS)
    expect(store.qrEvent).toBe('CONF')

    await vi.advanceTimersByTimeAsync(QR_POLL_INTERVAL_MS)
    expect(store.qrEvent).toBe('DONE')
    expect(store.session?.file).toBe('/tmp/credential.json')

    const pollsAfterDone = fetchMock.mock.calls.filter(([u]) => String(u) === '/login/checkQrcode').length
    await vi.advanceTimersByTimeAsync(QR_POLL_INTERVAL_MS * 3)
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u) === '/login/checkQrcode').length,
    ).toBe(pollsAfterDone)
  })

  it('超时事件停止轮询并给出提示文案', async () => {
    const { fetchMock } = mockApi({ qrEvents: [4], sendEvent: 'SEND' })
    const store = useLoginStore()

    await store.loadQr()
    await vi.advanceTimersByTimeAsync(QR_POLL_INTERVAL_MS)
    expect(store.qrEvent).toBe('TIMEOUT')

    const before = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(QR_POLL_INTERVAL_MS * 3)
    expect(fetchMock.mock.calls.length).toBe(before)
  })

  it('二维码获取失败进入 ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(null, 500)),
    )
    const store = useLoginStore()
    await store.loadQr()
    expect(store.qrEvent).toBe('ERROR')
    expect(store.qrError).not.toBe('')
  })

  it('发送验证码成功后启动 60s 倒计时，期间不可再次发送', async () => {
    mockApi({ qrEvents: [], sendEvent: 'SEND' })
    const store = useLoginStore()
    store.phone = '13800138000'

    await store.sendCode()
    expect(store.phoneMessage).toContain('已发送')
    expect(store.countdown).toBe(AUTHCODE_COUNTDOWN_S)
    expect(store.canSendCode).toBe(false)

    await vi.advanceTimersByTimeAsync(3000)
    expect(store.countdown).toBe(AUTHCODE_COUNTDOWN_S - 3)

    await vi.advanceTimersByTimeAsync((AUTHCODE_COUNTDOWN_S - 3) * 1000)
    expect(store.countdown).toBe(0)
    expect(store.canSendCode).toBe(true)
  })

  it('发送验证码遇到人机验证不启动倒计时', async () => {
    mockApi({ qrEvents: [], sendEvent: 'CAPTCHA' })
    const store = useLoginStore()
    store.phone = '13800138000'
    await store.sendCode()
    expect(store.countdown).toBe(0)
    expect(store.phoneMessage).toContain('人机验证')
  })

  it('clearTimers 停止轮询与倒计时', async () => {
    const { fetchMock } = mockApi({ qrEvents: [1, 1, 1, 1], sendEvent: 'SEND' })
    const store = useLoginStore()
    store.phone = '13800138000'
    await store.loadQr()
    await store.sendCode()

    const polls = () =>
      fetchMock.mock.calls.filter(([u]) => String(u) === '/login/checkQrcode').length
    const before = polls()
    store.clearTimers()
    await vi.advanceTimersByTimeAsync(QR_POLL_INTERVAL_MS * 5)

    expect(polls()).toBe(before)
    expect(store.countdown).toBe(AUTHCODE_COUNTDOWN_S)
  })
})
