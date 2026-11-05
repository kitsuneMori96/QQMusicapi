import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSearchStore } from './search'
import type { SearchItem } from '@/api/search'

const ITEM = {
  mid: '0039MnYb0qxYhV',
  id: 97773,
  name: '晴天',
  singer: '周杰伦',
  album: '叶惠美',
  albumMid: '000MkMni19ClKG',
  interval: 269,
}

const ALBUM = {
  mid: '000MkMni19ClKG',
  id: 8220,
  name: '叶惠美',
  singer: '周杰伦',
  songNum: 11,
  publishDate: '2003-07-31',
}

const SONGLIST = {
  id: '8231976688',
  name: '周杰伦精选',
  creator: '某用户',
  songNum: 50,
  listenNum: 12000,
  listenNumText: '1.2万',
  cover: 'https://example.invalid/cover.jpg',
}

function jsonResponse(data: unknown): Response {
  return {
    status: 200,
    text: async () => JSON.stringify({ code: 0, message: 'ok', data }),
  } as unknown as Response
}

/** 让请求按测试的节奏落地，不被 fetch 前的几个 microtask 影响 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function deferredFetch() {
  const gates: Array<(res: Response) => void> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          gates.push(resolve)
        }),
    ),
  )
  return gates
}

function ids(items: SearchItem[]): string[] {
  return items.map((item) => ('mid' in item ? item.mid : item.id))
}

function urls(): string[] {
  return vi.mocked(fetch).mock.calls.map((call) => String(call[0]))
}

describe('search store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('空关键词不发请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const store = useSearchStore()
    await store.run('   ')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.active).toBe(false)
  })

  it('成功后写入结果、分页与面板可见性', async () => {
    const gates = deferredFetch()
    const store = useSearchStore()
    const pending = store.run('晴天', 2)
    await settle()
    gates[0]!(
      jsonResponse({ keyword: '晴天', page: 2, num: 20, total: 1003, items: [ITEM] }),
    )
    await pending

    expect(store.active).toBe(true)
    expect(store.kind).toBe('song')
    expect(store.keyword).toBe('晴天')
    expect(store.page).toBe(2)
    expect(store.total).toBe(1003)
    expect(store.pages).toBe(51)
    expect(ids(store.items)).toEqual([ITEM.mid])
    expect(store.loading).toBe(false)
    expect(store.error).toBe('')
  })

  it('过期响应被丢弃，翻页不会串结果', async () => {
    const gates = deferredFetch()
    const store = useSearchStore()

    const first = store.run('甲', 1)
    await settle()
    const second = store.run('乙', 2)
    await settle()
    expect(gates.length).toBe(2)

    gates[1]!(jsonResponse({ keyword: '乙', page: 2, num: 20, total: 40, items: [ITEM] }))
    await second
    gates[0]!(
      jsonResponse({
        keyword: '甲',
        page: 1,
        num: 20,
        total: 20,
        items: [{ ...ITEM, mid: 'staleMid000000001', name: '过期' }],
      }),
    )
    await first

    expect(store.keyword).toBe('乙')
    expect(store.page).toBe(2)
    expect(ids(store.items)).toEqual([ITEM.mid])
    expect(store.loading).toBe(false)
  })

  it('失败就地显示错误并清空列表，不弹通知条', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 500,
        text: async () => JSON.stringify({ code: 500, message: '上游搜索超时' }),
      })),
    )
    const store = useSearchStore()
    await store.run('晴天')

    expect(store.active).toBe(true)
    expect(store.error).toBe('上游搜索超时')
    expect(store.items).toEqual([])
    expect(store.total).toBe(0)
    expect(store.loading).toBe(false)
  })

  it('越界与同页翻页不发请求', async () => {
    const gates = deferredFetch()
    const store = useSearchStore()
    const pending = store.run('晴天')
    await settle()
    gates[0]!(jsonResponse({ keyword: '晴天', page: 1, num: 20, total: 25, items: [ITEM] }))
    await pending
    expect(gates.length).toBe(1)

    store.turn(1)
    store.turn(0)
    store.turn(3)
    expect(gates.length).toBe(1)

    store.turn(2)
    await settle()
    expect(gates.length).toBe(2)
  })

  it('clear 收起面板并丢弃在途结果', async () => {
    const gates = deferredFetch()
    const store = useSearchStore()
    const pending = store.run('晴天')
    await settle()
    store.clear()
    gates[0]!(jsonResponse({ keyword: '晴天', page: 1, num: 20, total: 1, items: [ITEM] }))
    await pending

    expect(store.active).toBe(false)
    expect(store.items).toEqual([])
    expect(store.keyword).toBe('')
  })

  it('三档各打各的端点，切页签不重发', async () => {
    const gates = deferredFetch()
    const store = useSearchStore()
    const song = store.run('晴天')
    await settle()
    gates[0]!(jsonResponse({ keyword: '晴天', page: 1, num: 20, total: 1, items: [ITEM] }))
    await song

    const album = store.setKind('album')
    await settle()
    gates[1]!(jsonResponse({ keyword: '晴天', page: 1, num: 20, total: 1, items: [ALBUM] }))
    await album
    expect(urls()[1]).toContain('/search/album?')

    const songlist = store.setKind('songlist')
    await settle()
    gates[2]!(
      jsonResponse({ keyword: '晴天', page: 1, num: 20, total: 1, items: [SONGLIST] }),
    )
    await songlist
    expect(urls()[2]).toContain('/search/songlist?')

    expect(urls()[0]).toContain('/search/song?')
    expect(store.kind).toBe('songlist')
    expect(ids(store.items)).toEqual([SONGLIST.id])

    // 已加载的三档都可直接复用缓存
    await store.setKind('song')
    await store.setKind('album')
    expect(ids(store.items)).toEqual([ALBUM.mid])
    expect(gates.length).toBe(3)
  })

  it('换关键词时三档缓存一起作废', async () => {
    const gates = deferredFetch()
    const store = useSearchStore()
    const first = store.run('晴天')
    await settle()
    gates[0]!(jsonResponse({ keyword: '晴天', page: 1, num: 20, total: 1, items: [ITEM] }))
    await first

    const album = store.setKind('album')
    await settle()
    gates[1]!(jsonResponse({ keyword: '晴天', page: 1, num: 20, total: 1, items: [ALBUM] }))
    await album

    const next = store.run('夜曲', 1, 'album')
    await settle()
    gates[2]!(jsonResponse({ keyword: '夜曲', page: 1, num: 20, total: 1, items: [] }))
    await next

    expect(store.keyword).toBe('夜曲')
    expect(store.kind).toBe('album')
    // 换词后歌曲档缓存作废，回到歌曲页签会重新请求
    const back = store.setKind('song')
    await settle()
    expect(gates.length).toBe(4)
    expect(urls()[3]).toContain('keyword=%E5%A4%9C%E6%9B%B2')
    gates[3]!(jsonResponse({ keyword: '夜曲', page: 1, num: 20, total: 0, items: [] }))
    await back
  })

  it('翻页只动当前页签', async () => {
    const gates = deferredFetch()
    const store = useSearchStore()
    const song = store.run('晴天')
    await settle()
    gates[0]!(jsonResponse({ keyword: '晴天', page: 1, num: 20, total: 45, items: [ITEM] }))
    await song

    const album = store.setKind('album')
    await settle()
    gates[1]!(jsonResponse({ keyword: '晴天', page: 1, num: 20, total: 21, items: [ALBUM] }))
    await album

    store.turn(2)
    await settle()
    expect(gates.length).toBe(3)
    gates[2]!(jsonResponse({ keyword: '晴天', page: 2, num: 20, total: 21, items: [] }))
    await settle()
    expect(urls()[2]).toContain('/search/album?')
    expect(urls()[2]).toContain('page=2')

    await store.setKind('song')
    expect(store.page).toBe(1)
  })
})
