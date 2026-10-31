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
})
