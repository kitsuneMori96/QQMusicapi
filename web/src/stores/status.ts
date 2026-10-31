import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getHealth } from '@/api/health'
import type { HealthData } from '@/api/types'

export type ServicePhase = 'idle' | 'checking' | 'online' | 'offline'

/**
 * 服务/登录状态。仅做健康探测，不做登录流程本身。
 */
export const useStatusStore = defineStore('status', () => {
  const phase = ref<ServicePhase>('idle')
  const health = ref<HealthData | null>(null)
  const error = ref('')
  const lastCheckedAt = ref<number | null>(null)

  const loggedIn = ref(false)

  async function refresh(): Promise<void> {
    if (phase.value === 'checking') return
    phase.value = 'checking'
    error.value = ''
    try {
      health.value = await getHealth()
      phase.value = 'online'
      loggedIn.value = Boolean(health.value.loggedIn)
    } catch (e) {
      phase.value = 'offline'
      health.value = null
      loggedIn.value = false
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      lastCheckedAt.value = Date.now()
    }
  }

  return { phase, health, error, lastCheckedAt, loggedIn, refresh }
})
