import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getHealth } from '@/api/health'
import type { HealthData } from '@/api/contracts'

export type ServicePhase = 'idle' | 'checking' | 'online' | 'offline'

/** 在线时 30s 一轮；离线按 5/10/20/30s 退避，服务恢复后自动回到 30s */
export const HEALTH_INTERVAL_MS = 30_000
export const HEALTH_RETRY_MS = [5_000, 10_000, 20_000, 30_000] as const
/** 聚焦/回到前台时若距上次探测不足该间隔则跳过，避免窗口抖动打满请求 */
export const HEALTH_FOCUS_MIN_GAP_MS = 3_000

/**
 * 服务/登录状态。仅做健康探测，不做登录流程本身。
 */
export const useStatusStore = defineStore('status', () => {
  const phase = ref<ServicePhase>('idle')
  const health = ref<HealthData | null>(null)
  const error = ref('')
  const lastCheckedAt = ref<number | null>(null)
  const polling = ref(false)

  const loggedIn = ref(false)

  let timer: ReturnType<typeof setTimeout> | null = null
  let failures = 0
  let listenersAttached = false

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function nextDelay(): number {
    if (phase.value === 'online') return HEALTH_INTERVAL_MS
    const index = Math.max(0, Math.min(failures - 1, HEALTH_RETRY_MS.length - 1))
    return HEALTH_RETRY_MS[index] ?? HEALTH_INTERVAL_MS
  }

  function schedule(): void {
    clearTimer()
    if (!polling.value) return
    timer = setTimeout(() => {
      timer = null
      void refresh()
    }, nextDelay())
  }

  async function refresh(): Promise<boolean> {
    if (phase.value === 'checking') return false
    phase.value = 'checking'
    error.value = ''
    let ok = false
    try {
      health.value = await getHealth()
      phase.value = 'online'
      loggedIn.value = Boolean(health.value.loggedIn)
      failures = 0
      ok = true
    } catch (e) {
      phase.value = 'offline'
      health.value = null
      loggedIn.value = false
      error.value = e instanceof Error ? e.message : String(e)
      failures += 1
    } finally {
      lastCheckedAt.value = Date.now()
      schedule()
    }
    return ok
  }

  /** 页面重新可见/获得焦点时立即探测（最近刚探测过则跳过） */
  function probe(): void {
    if (!polling.value || document.hidden) return
    if (phase.value === 'checking') return
    if (lastCheckedAt.value && Date.now() - lastCheckedAt.value < HEALTH_FOCUS_MIN_GAP_MS) return
    clearTimer()
    void refresh()
  }

  function onVisibilityChange(): void {
    if (document.hidden) clearTimer()
    else probe()
  }

  /** 由 AppShell 在挂载/卸载时调起，自动轮询只在页面生命周期内存在 */
  function start(): void {
    if (!polling.value) {
      polling.value = true
      failures = 0
      void refresh()
    }
    if (!listenersAttached) {
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('focus', probe)
      listenersAttached = true
    }
  }

  function stop(): void {
    polling.value = false
    clearTimer()
    if (listenersAttached) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', probe)
      listenersAttached = false
    }
  }

  return {
    phase,
    health,
    error,
    lastCheckedAt,
    polling,
    loggedIn,
    refresh,
    probe,
    start,
    stop,
  }
})
