import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNoticeStore } from './notice'

describe('notice store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('最多保留最近 5 条', () => {
    const store = useNoticeStore()
    for (let i = 0; i < 7; i++) store.info(`n${i}`)
    expect(store.items).toHaveLength(5)
    expect(store.items[0]?.text).toBe('n2')
    expect(store.items.at(-1)?.text).toBe('n6')
  })

  it('非 error 提示 6s 后自动消失，error 常驻', () => {
    const store = useNoticeStore()
    store.info('自动消失')
    store.error('常驻')
    expect(store.items).toHaveLength(2)

    vi.advanceTimersByTime(6000)
    expect(store.items.map((n) => n.text)).toEqual(['常驻'])
  })

  it('dismiss 可手动关闭并清理定时器', () => {
    const store = useNoticeStore()
    const id = store.error('手动关闭')
    store.dismiss(id)
    expect(store.items).toHaveLength(0)
  })

  it('相同 key 的提示合并为一条并更新详情', () => {
    const store = useNoticeStore()
    store.error('登录状态已失效', '凭证已过期', { key: 'auth-expired' })
    store.error('登录状态已失效', '凭证无效', { key: 'auth-expired' })
    expect(store.items).toHaveLength(1)
    expect(store.items[0]?.detail).toBe('凭证无效')
  })

  it('携带 action 时保留跳转信息', () => {
    const store = useNoticeStore()
    store.error('登录状态已失效', '', {
      action: { label: '去登录', to: '/login' },
    })
    expect(store.items[0]?.action).toEqual({ label: '去登录', to: '/login' })
  })
})
