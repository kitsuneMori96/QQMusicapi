import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getLoginStatus,
  getUserSelf,
  postLogout,
  postPhoneLogin,
  postQrCheck,
  postQrCode,
  postRefreshCredential,
  postSendAuthcode,
} from '@/api/login'
import type { LoginStatusData, UserSelfData } from '@/api/contracts'
import { useNoticeStore } from './notice'
import { useStatusStore } from './status'

export type LoginTab = 'qr' | 'phone'

/** 二维码轮询状态机（与后端 event 码一一对应） */
export type QrEvent =
  | 'IDLE'
  | 'LOADING'
  | 'WAIT'
  | 'SCAN'
  | 'CONF'
  | 'DONE'
  | 'REFUSE'
  | 'TIMEOUT'
  | 'ERROR'

export const QR_EVENT_MAP: Record<number, QrEvent> = {
  0: 'DONE',
  1: 'SCAN',
  2: 'CONF',
  3: 'REFUSE',
  4: 'TIMEOUT',
  [-1]: 'ERROR',
}

export const QR_HINT: Record<QrEvent, string> = {
  IDLE: '等待获取二维码',
  LOADING: '正在获取二维码…',
  WAIT: '请使用 QQ 扫描二维码',
  SCAN: '已扫码，请在手机上确认',
  CONF: '已确认，正在授权…',
  DONE: '登录成功',
  REFUSE: '已拒绝登录',
  TIMEOUT: '二维码已过期，正在自动刷新…',
  ERROR: '轮询失败',
}

/** 轮询间隔：与旧页一致 2s */
export const QR_POLL_INTERVAL_MS = 2000
/** 验证码倒计时秒数 */
export const AUTHCODE_COUNTDOWN_S = 60
/** QQ 二维码有效期（秒）；到期或服务端报 TIMEOUT 后自动换新码 */
export const QR_TTL_S = 120
/** 过期后自动刷新的延迟，留一点时间让用户看到「已过期」状态 */
export const QR_AUTO_REFRESH_DELAY_MS = 1500

export type PhoneTone = '' | 'ok' | 'warn' | 'err'

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 登录页状态：会话状态、二维码轮询、手机验证码、用户信息、凭证操作。
 *
 * 所有定时器登记在 timers 中，页面卸载时 clearTimers() 全清——
 * 旧页换路由后轮询仍在跑的泄漏问题不再复现。
 */
export const useLoginStore = defineStore('login', () => {
  const notice = useNoticeStore()
  const status = useStatusStore()

  const tab = ref<LoginTab>('qr')

  // 会话状态
  const session = ref<LoginStatusData | null>(null)
  const sessionLoading = ref(false)
  const sessionError = ref('')

  // 用户信息
  const user = ref<UserSelfData | null>(null)
  const userLoading = ref(false)
  const userError = ref('')

  // 二维码
  const qrEvent = ref<QrEvent>('IDLE')
  const qrImageUrl = ref('')
  const identifier = ref('')
  const qrError = ref('')
  const qrPolling = ref(false)
  const qrRemaining = ref(0)

  // 手机登录
  const countryCode = ref('86')
  const phone = ref('')
  const authcode = ref('')
  const countdown = ref(0)
  const sendingCode = ref(false)
  const phoneBusy = ref(false)
  const phoneMessage = ref('')
  const phoneMessageTone = ref<PhoneTone>('')

  // 凭证操作
  const credentialBusy = ref(false)

  const timers = new Set<ReturnType<typeof setInterval>>()
  const timeouts = new Set<ReturnType<typeof setTimeout>>()
  let qrPollTimer: ReturnType<typeof setInterval> | null = null
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let qrTtlTimer: ReturnType<typeof setInterval> | null = null
  let qrRefreshTimer: ReturnType<typeof setTimeout> | null = null

  const qrBusy = computed(() => qrEvent.value === 'LOADING')
  const normalizedCountryCode = computed(() => countryCode.value.replace(/\D/g, '') || '86')
  const phoneValid = computed(() =>
    normalizedCountryCode.value === '86'
      ? /^\d{11}$/.test(phone.value.trim())
      : /^\d{5,15}$/.test(phone.value.trim()),
  )
  const canSendCode = computed(
    () => phoneValid.value && countdown.value === 0 && !sendingCode.value,
  )
  const loggedIn = computed(() => Boolean(session.value?.loggedIn))

  function phoneHint(text: string, tone: PhoneTone): void {
    phoneMessage.value = text
    phoneMessageTone.value = tone
  }

  function track(timer: ReturnType<typeof setInterval>): ReturnType<typeof setInterval> {
    timers.add(timer)
    return timer
  }

  function untrack(timer: ReturnType<typeof setInterval>): void {
    clearInterval(timer)
    timers.delete(timer)
  }

  function clearTimers(): void {
    for (const timer of timers) clearInterval(timer)
    timers.clear()
    for (const timeout of timeouts) clearTimeout(timeout)
    timeouts.clear()
    qrPollTimer = null
    countdownTimer = null
    qrTtlTimer = null
    qrRefreshTimer = null
  }

  // ==================== 会话 / 用户 ====================

  async function refreshStatus(): Promise<void> {
    sessionLoading.value = true
    sessionError.value = ''
    try {
      session.value = await getLoginStatus()
      // 同步顶栏 AUTH 标记
      void status.refresh()
      if (session.value.loggedIn) await loadUser()
      else user.value = null
    } catch (error) {
      session.value = null
      sessionError.value = errText(error)
    } finally {
      sessionLoading.value = false
    }
  }

  async function loadUser(): Promise<void> {
    userLoading.value = true
    userError.value = ''
    try {
      user.value = await getUserSelf()
    } catch (error) {
      user.value = null
      userError.value = errText(error)
    } finally {
      userLoading.value = false
    }
  }

  // ==================== 二维码 ====================

  function stopQrPoll(): void {
    if (qrPollTimer) {
      untrack(qrPollTimer)
      qrPollTimer = null
    }
  }

  function stopQrTtl(): void {
    if (qrTtlTimer) {
      untrack(qrTtlTimer)
      qrTtlTimer = null
    }
    qrRemaining.value = 0
  }

  function cancelQrRefresh(): void {
    if (qrRefreshTimer) {
      clearTimeout(qrRefreshTimer)
      timeouts.delete(qrRefreshTimer)
      qrRefreshTimer = null
    }
  }

  /** 到期/超时后延迟换一张新码；已登录则不再打扰 */
  function scheduleQrRefresh(delay = QR_AUTO_REFRESH_DELAY_MS): void {
    cancelQrRefresh()
    qrRefreshTimer = setTimeout(() => {
      if (qrRefreshTimer) timeouts.delete(qrRefreshTimer)
      qrRefreshTimer = null
      if (!loggedIn.value) void loadQr()
    }, delay)
    timeouts.add(qrRefreshTimer)
  }

  function startQrTtl(): void {
    stopQrTtl()
    qrRemaining.value = QR_TTL_S
    qrTtlTimer = track(
      setInterval(() => {
        qrRemaining.value -= 1
        if (qrRemaining.value <= 0) {
          stopQrTtl()
          scheduleQrRefresh()
        }
      }, 1000),
    )
  }

  /** 停止轮询并清空二维码（切换账号 / 离开页面时调用） */
  function resetQr(): void {
    stopQrPoll()
    stopQrTtl()
    cancelQrRefresh()
    qrEvent.value = 'IDLE'
    qrImageUrl.value = ''
    identifier.value = ''
    qrError.value = ''
    qrPolling.value = false
  }

  async function loadQr(): Promise<void> {
    resetQr()
    qrEvent.value = 'LOADING'
    try {
      const data = await postQrCode('qq')
      identifier.value = data.identifier
      qrImageUrl.value = `data:${data.mime};base64,${data.data}`
      qrEvent.value = 'WAIT'
      startQrPoll()
      startQrTtl()
    } catch (error) {
      qrEvent.value = 'ERROR'
      qrError.value = errText(error)
      notice.error('获取二维码失败', qrError.value)
    }
  }

  function startQrPoll(): void {
    stopQrPoll()
    qrPollTimer = track(setInterval(() => void pollQr(), QR_POLL_INTERVAL_MS))
  }

  async function pollQr(): Promise<void> {
    if (!identifier.value || qrPolling.value) return
    qrPolling.value = true
    try {
      const data = await postQrCheck(identifier.value, 'qq')
      const next = QR_EVENT_MAP[data.event] ?? 'ERROR'
      qrEvent.value = next
      if (next === 'DONE') {
        stopQrPoll()
        stopQrTtl()
        cancelQrRefresh()
        notice.success('登录成功')
        await refreshStatus()
      } else if (next === 'TIMEOUT') {
        stopQrPoll()
        stopQrTtl()
        scheduleQrRefresh()
      } else if (next === 'REFUSE' || next === 'ERROR') {
        stopQrPoll()
        stopQrTtl()
      }
    } catch (error) {
      stopQrPoll()
      stopQrTtl()
      qrEvent.value = 'ERROR'
      qrError.value = errText(error)
    } finally {
      qrPolling.value = false
    }
  }

  // ==================== 手机验证码 ====================

  function stopCountdown(): void {
    if (countdownTimer) {
      untrack(countdownTimer)
      countdownTimer = null
    }
  }

  function startCountdown(seconds: number): void {
    stopCountdown()
    countdown.value = seconds
    countdownTimer = track(
      setInterval(() => {
        countdown.value -= 1
        if (countdown.value <= 0) {
          stopCountdown()
          countdown.value = 0
        }
      }, 1000),
    )
  }

  async function sendCode(): Promise<void> {
    if (!phoneValid.value) {
      phoneHint(
        normalizedCountryCode.value === '86' ? '请输入 11 位手机号' : '请输入有效手机号',
        'err',
      )
      return
    }
    const phoneNumber = phone.value.trim()
    sendingCode.value = true
    phoneHint('', '')
    try {
      const data = await postSendAuthcode(phoneNumber, Number(normalizedCountryCode.value) || 86)
      if (data.event === 'SEND') {
        phoneHint('验证码已发送，请查收短信', 'ok')
        notice.success('验证码已发送')
        startCountdown(AUTHCODE_COUNTDOWN_S)
      } else if (data.event === 'CAPTCHA') {
        phoneHint('需要人机验证，暂不支持', 'warn')
      } else {
        phoneHint('发送过于频繁，请稍后再试', 'warn')
        startCountdown(30)
      }
    } catch (error) {
      phoneHint(`发送失败: ${errText(error)}`, 'err')
    } finally {
      sendingCode.value = false
    }
  }

  async function loginByPhone(): Promise<void> {
    if (!phoneValid.value) {
      phoneHint(
        normalizedCountryCode.value === '86' ? '请输入 11 位手机号' : '请输入有效手机号',
        'err',
      )
      return
    }
    const code = authcode.value.trim()
    if (!/^\d{6}$/.test(code)) {
      phoneHint('请输入 6 位验证码', 'err')
      return
    }
    phoneBusy.value = true
    phoneHint('', '')
    try {
      await postPhoneLogin(phone.value.trim(), code)
      notice.success('登录成功')
      phoneHint('登录成功', 'ok')
      qrEvent.value = 'DONE'
      stopQrPoll()
      stopQrTtl()
      cancelQrRefresh()
      await refreshStatus()
    } catch (error) {
      phoneHint(`登录失败: ${errText(error)}`, 'err')
    } finally {
      phoneBusy.value = false
    }
  }

  // ==================== 凭证 ====================

  async function refreshCredential(): Promise<void> {
    credentialBusy.value = true
    try {
      await postRefreshCredential()
      notice.success('凭证已刷新')
      await refreshStatus()
    } catch (error) {
      notice.error('刷新凭证失败', errText(error))
    } finally {
      credentialBusy.value = false
    }
  }

  async function logout(): Promise<void> {
    credentialBusy.value = true
    try {
      await postLogout()
      notice.success('已退出登录')
      user.value = null
      resetQr()
      await refreshStatus()
      qrEvent.value = 'IDLE'
      void loadQr()
    } catch (error) {
      notice.error('退出登录失败', errText(error))
    } finally {
      credentialBusy.value = false
    }
  }

  return {
    tab,
    session,
    sessionLoading,
    sessionError,
    user,
    userLoading,
    userError,
    qrEvent,
    qrImageUrl,
    identifier,
    qrError,
    qrPolling,
    qrRemaining,
    countryCode,
    phone,
    authcode,
    countdown,
    sendingCode,
    phoneBusy,
    phoneMessage,
    phoneMessageTone,
    credentialBusy,
    qrBusy,
    phoneValid,
    canSendCode,
    loggedIn,
    clearTimers,
    refreshStatus,
    loadUser,
    loadQr,
    resetQr,
    stopQrPoll,
    sendCode,
    loginByPhone,
    refreshCredential,
    logout,
  }
})
