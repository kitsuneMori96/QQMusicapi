import { defineStore } from 'pinia'
import { ref } from 'vue'

export type NoticeLevel = 'info' | 'ok' | 'warn' | 'error'

export interface NoticeAction {
  label: string
  to: string
}

export interface Notice {
  id: number
  level: NoticeLevel
  text: string
  detail?: string
  action?: NoticeAction
  /** 相同 key 的通知合并，避免批量请求同时失败时刷屏 */
  key?: string
  at: number
}

export interface NoticeOptions {
  key?: string
  action?: NoticeAction
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

  function push(
    level: NoticeLevel,
    text: string,
    detail?: string,
    options: NoticeOptions = {},
  ): number {
    if (options.key) {
      const existing = items.value.find((n) => n.key === options.key)
      if (existing) {
        existing.detail = detail
        existing.at = Date.now()
        return existing.id
      }
    }
    const id = ++seq
    items.value = [
      ...items.value,
      { id, level, text, detail, action: options.action, key: options.key, at: Date.now() },
    ].slice(-5)
    if (level !== 'error') {
      timers.set(
        id,
        setTimeout(() => dismiss(id), 6000),
      )
    }
    return id
  }

  const info = (text: string, detail?: string, options?: NoticeOptions) =>
    push('info', text, detail, options)
  const success = (text: string, detail?: string, options?: NoticeOptions) =>
    push('ok', text, detail, options)
  const warn = (text: string, detail?: string, options?: NoticeOptions) =>
    push('warn', text, detail, options)
  const error = (text: string, detail?: string, options?: NoticeOptions) =>
    push('error', text, detail, options)

  function clear(): void {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    items.value = []
  }

  return { items, push, info, success, warn, error, dismiss, clear }
})
