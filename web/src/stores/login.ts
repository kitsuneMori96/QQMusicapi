import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type LoginTab = 'qr' | 'phone'

/** 二维码轮询状态机（与后端 event 码一一对应） */
export type QrEvent = 'IDLE' | 'LOADING' | 'WAIT' | 'SCAN' | 'CONF' | 'DONE' | 'REFUSE' | 'TIMEOUT' | 'ERROR'

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
  TIMEOUT: '二维码已过期，请刷新',
  ERROR: '轮询失败',
}

/**
 * 登录页状态。接口与 2s 轮询在 contracts 落地后接入；
 * 定时器统一登记在 timers 里，页面卸载时 clearTimers() 全清，避免泄漏。
 */
export const useLoginStore = defineStore('login', () => {
  const tab = ref<LoginTab>('qr')

  // 二维码
  const qrEvent = ref<QrEvent>('IDLE')
  const qrImageUrl = ref('')
  const identifier = ref('')

  // 手机号登录
  const countryCode = ref('86')
  const phone = ref('')
  const authcode = ref('')
  const countdown = ref(0)

  const qrBusy = computed(() => qrEvent.value === 'LOADING' || qrEvent.value === 'CONF')
  const canSendCode = computed(() => phone.value.trim().length > 0 && countdown.value === 0)

  const timers = new Set<ReturnType<typeof setInterval>>()

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
  }

  function resetQr(): void {
    qrEvent.value = 'IDLE'
    qrImageUrl.value = ''
    identifier.value = ''
  }

  return {
    tab,
    qrEvent,
    qrImageUrl,
    identifier,
    countryCode,
    phone,
    authcode,
    countdown,
    qrBusy,
    canSendCode,
    track,
    untrack,
    clearTimers,
    resetQr,
  }
})
