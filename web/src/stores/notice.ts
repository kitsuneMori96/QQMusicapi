import { defineStore } from 'pinia'
import { ref } from 'vue'

export type NoticeLevel = 'info' | 'ok' | 'warn' | 'error'

export interface Notice {
  id: number
  level: NoticeLevel
  text: string
  detail?: string
  at: number
}

let seq = 0

/**
 * 全局提示条：页面内任何异常都要可见（旧页面「点了没反应」的教训）。
 * 只保留最近 5 条，error 常驻直到手动关闭，其余 6s 自动消失。
 */
export const useNoticeStore = defineStore('notice', () => {
  const items = ref<Notice[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function dismiss(id: number): void {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    items.value = items.value.filter((n) => n.id !== id)
  }

  function push(level: NoticeLevel, text: string, detail?: string): number {
    const id = ++seq
    items.value = [...items.value, { id, level, text, detail, at: Date.now() }].slice(-5)
    if (level !== 'error') {
      timers.set(
        id,
        setTimeout(() => dismiss(id), 6000),
      )
    }
    return id
  }

  const info = (text: string, detail?: string) => push('info', text, detail)
  const success = (text: string, detail?: string) => push('ok', text, detail)
  const warn = (text: string, detail?: string) => push('warn', text, detail)
  const error = (text: string, detail?: string) => push('error', text, detail)

  function clear(): void {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    items.value = []
  }

  return { items, push, info, success, warn, error, dismiss, clear }
})
