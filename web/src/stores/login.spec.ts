import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  AUTHCODE_COUNTDOWN_S,
  QR_AUTO_REFRESH_DELAY_MS,
  QR_POLL_INTERVAL_MS,
  QR_TTL_S,
  useLoginStore,
} from './login'

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
    // 重置 fake clock，丢弃上个用例遗留的轮询/倒计时
    vi.useRealTimers()
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

  it('超时事件停止轮询，随后自动换新码', async () => {
    const { fetchMock } = mockApi({ qrEvents: [4, 1], sendEvent: 'SEND' })
    const store = useLoginStore()

    await store.loadQr()
    await vi.advanceTimersByTimeAsync(QR_POLL_INTERVAL_MS)
    expect(store.qrEvent).toBe('TIMEOUT')
    expect(store.qrRemaining).toBe(0)

    const qrCalls = () =>
      fetchMock.mock.calls.filter(([u]) => String(u) === '/login/qrcode').length
    expect(qrCalls()).toBe(1)
    await vi.advanceTimersByTimeAsync(QR_AUTO_REFRESH_DELAY_MS)
    expect(qrCalls()).toBe(2)
    expect(store.qrEvent).toBe('WAIT')
  })

  it('二维码到期后自动换码并重新计时', async () => {
    mockApi({ qrEvents: [], sendEvent: 'SEND' })
    const store = useLoginStore()

    await store.loadQr()
    expect(store.qrRemaining).toBe(QR_TTL_S)

    await vi.advanceTimersByTimeAsync(QR_TTL_S * 1000)
    expect(store.qrRemaining).toBe(0)

    await vi.advanceTimersByTimeAsync(QR_AUTO_REFRESH_DELAY_MS)
    expect(store.qrEvent).toBe('WAIT')
    expect(store.qrRemaining).toBeGreaterThan(0)
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

  it('手机号不足 11 位时发码与登录都只给提示不发请求', async () => {
    const { fetchMock } = mockApi({ qrEvents: [], sendEvent: 'SEND' })
    const store = useLoginStore()
    store.phone = '138'
    store.authcode = '123456'

    await store.sendCode()
    expect(store.phoneMessageTone).toBe('err')
    expect(store.phoneMessage).toContain('11 位')
    expect(fetchMock).not.toHaveBeenCalled()

    await store.loginByPhone()
    expect(store.phoneMessageTone).toBe('err')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('验证码不是 6 位时登录前拦截', async () => {
    const { fetchMock } = mockApi({ qrEvents: [], sendEvent: 'SEND' })
    const store = useLoginStore()
    store.phone = '13800138000'
    store.authcode = '12'

    await store.loginByPhone()
    expect(store.phoneMessageTone).toBe('err')
    expect(store.phoneMessage).toContain('6 位')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('发码成功的提示语气为 ok', async () => {
    mockApi({ qrEvents: [], sendEvent: 'SEND' })
    const store = useLoginStore()
    store.phone = '13800138000'
    await store.sendCode()
    expect(store.phoneMessageTone).toBe('ok')
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
