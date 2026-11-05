import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCollectionStore } from './collection'

const TRACK = {
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
  name: '叶惠美',
  singer: '周杰伦',
  publishDate: '2003-07-31',
  desc: '',
  total: 1,
  page: 1,
  num: 50,
  hasMore: false,
  items: [TRACK],
}

const SONGLIST = {
  id: '8231976688',
  name: '周杰伦精选',
  creator: '某用户',
  cover: 'https://example.invalid/pic.jpg',
  desc: '一些歌',
  total: 2,
  page: 1,
  num: 30,
  hasMore: true,
  items: [TRACK],
}

function jsonResponse(data: unknown): Response {
  return {
    status: 200,
    text: async () => JSON.stringify({ code: 0, message: 'ok', data }),
  } as unknown as Response
}

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

describe('collection store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('打开专辑：头部从专辑身份拼出来，曲目就位', async () => {
    const gates = deferredFetch()
    const store = useCollectionStore()
    const pending = store.open('album', '000MkMni19ClKG')
    await settle()
    gates[0]!(jsonResponse(ALBUM))
    await pending

    expect(store.active).toBe(true)
    expect(store.kind).toBe('album')
    expect(store.name).toBe('叶惠美')
    expect(store.sub).toBe('周杰伦 · 2003-07-31')
    expect(store.cover).toContain('000MkMni19ClKG')
    expect(store.items.map((t) => t.mid)).toEqual([TRACK.mid])
    expect(store.loading).toBe(false)
  })

  it('打开歌单：封面与作者来自接口，加载更多追加曲目', async () => {
    const gates = deferredFetch()
    const store = useCollectionStore()
    const pending = store.open('songlist', '8231976688')
    await settle()
    gates[0]!(jsonResponse(SONGLIST))
    await pending

    expect(store.sub).toBe('某用户')
    expect(store.cover).toBe('https://example.invalid/pic.jpg')
    expect(store.hasMore).toBe(true)

    const more = store.loadMore()
    await settle()
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain('/songlist/detail?')
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain('page=2')
    gates[1]!(
      jsonResponse({
        ...SONGLIST,
        page: 2,
        hasMore: false,
        items: [{ ...TRACK, mid: 'anotherMid001', name: '夜曲' }],
      }),
    )
    await more

    expect(store.items.map((t) => t.name)).toEqual(['晴天', '夜曲'])
    expect(store.hasMore).toBe(false)
    expect(store.loadingMore).toBe(false)
  })

  it('没有下一页时加载更多不发请求', async () => {
    const gates = deferredFetch()
    const store = useCollectionStore()
    const pending = store.open('album', '000MkMni19ClKG')
    await settle()
    gates[0]!(jsonResponse(ALBUM))
    await pending

    await store.loadMore()
    expect(gates.length).toBe(1)
  })

  it('打开新合集时丢弃上一份的过期响应', async () => {
    const gates = deferredFetch()
    const store = useCollectionStore()
    const first = store.open('album', '000MkMni19ClKG')
    await settle()
    const second = store.open('album', 'staleAlbumMid01')
    await settle()

    gates[1]!(jsonResponse({ ...ALBUM, mid: 'staleAlbumMid01', name: '新专辑' }))
    await second
    gates[0]!(jsonResponse(ALBUM))
    await first

    expect(store.id).toBe('staleAlbumMid01')
    expect(store.name).toBe('新专辑')
  })

  it('失败就地报错并清空曲目', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 404,
        text: async () => JSON.stringify({ code: 404, message: '专辑不存在' }),
      })),
    )
    const store = useCollectionStore()
    await store.open('album', '000MkMni19ClKG')

    expect(store.active).toBe(true)
    expect(store.error).toBe('专辑不存在')
    expect(store.items).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('关闭后回到未打开状态', async () => {
    const gates = deferredFetch()
    const store = useCollectionStore()
    const pending = store.open('songlist', '8231976688')
    await settle()
    store.close()
    gates[0]!(jsonResponse(SONGLIST))
    await pending

    expect(store.active).toBe(false)
    expect(store.items).toEqual([])
    expect(store.name).toBe('')
  })
})
