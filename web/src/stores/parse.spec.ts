import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useParseStore } from './parse'
import { useNoticeStore } from './notice'

const MID = '002kR3lm1nTxkV'

function jsonResponse(data: unknown): Response {
  return {
    status: 200,
    text: async () => JSON.stringify({ code: 0, message: 'ok', data }),
  } as unknown as Response
}

function mockBackend(options: { detailFails?: boolean; allUrlsFail?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.startsWith('/song/detail')) {
      if (options.detailFails) {
        return {
          status: 500,
          text: async () => JSON.stringify({ code: 500, message: '上游超时' }),
        } as unknown as Response
      }
      return jsonResponse({
        tracks: [
          {
            id: 123456,
            mid: MID,
            name: '测试曲目',
            singer: [{ name: '甲' }, { name: '乙' }],
            album: { mid: 'albumMid0001', name: '测试专辑' },
            interval: 225,
          },
        ],
      })
    }
    if (url.startsWith('/song/urls')) {
      const params = new URL(`http://x${url}`).searchParams
      const type = params.get('type') ?? ''
      const key = params.get('mids') ?? MID
      return jsonResponse(
        options.allUrlsFail
          ? { [key]: { error: '无版权' } }
          : type === 'F000' || type === 'M800'
            ? { [key]: { url: `https://cdn.example/${type}.flac` } }
            : { [key]: { error: `不支持 ${type}` } },
      )
    }
    if (url.startsWith('/song/lyric')) {
      return jsonResponse({ lyric: '[00:00.000]歌词', trans: '[00:00.000]translation' })
    }
    if (url.startsWith('/song/similar')) {
      return jsonResponse({
        list: [
          { id: 2, mid: 'similarMid01', name: '相似曲', singer: [{ name: '丙' }] },
          { id: 3, mid: 'similarMid02', name: '相似曲 2', singer: [{ name: '丁' }, { name: '戊' }] },
        ],
      })
    }
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('parse store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('无法识别 mid 时不发请求，只提示', async () => {
    const fetchMock = mockBackend()
    const store = useParseStore()
    store.input = 'hello world'
    await store.parse()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(useNoticeStore().items[0]?.level).toBe('warn')
    expect(store.phase).toBe('idle')
  })

  it('完整解析：详情 / 17 档直链 / 歌词 / 相似', async () => {
    mockBackend()
    const store = useParseStore()
    store.input = `https://y.qq.com/n/ryqq/songDetail/${MID}`
    await store.parse()

    expect(store.mid).toBe(MID)
    expect(store.phase).toBe('ready')
    expect(store.track?.name).toBe('测试曲目')
    expect(store.qualities.F000).toEqual({ status: 'ok', url: 'https://cdn.example/F000.flac' })
    expect(store.qualities.C200?.status).toBe('err')
    expect(store.qualities.C200?.error).toContain('不支持 C200')
    expect(store.resolved).toBe(2)
    expect(store.lyric?.lyric).toContain('歌词')
    expect(store.similar.map((s) => s.singer)).toEqual(['丙', '丁 / 戊'])
    expect(store.urlOf('F000')?.url).toContain('F000.flac')
    expect(store.urlOf('C200')).toBeUndefined()
  })

  it('详情失败不阻断直链与歌词', async () => {
    mockBackend({ detailFails: true })
    const store = useParseStore()
    store.input = MID
    await store.parse()

    expect(store.detailError).toContain('上游超时')
    expect(store.track).toBeNull()
    expect(store.phase).toBe('ready')
    expect(store.resolved).toBe(2)
    expect(store.similar).toHaveLength(0)
  })

  it('详情与全部直链都失败时进入 error 并提示', async () => {
    mockBackend({ detailFails: true, allUrlsFail: true })
    const store = useParseStore()
    store.input = MID
    await store.parse()

    expect(store.phase).toBe('error')
    expect(store.resolved).toBe(0)
    expect(useNoticeStore().items.some((n) => n.level === 'error')).toBe(true)
  })

  it('重新解析会清空上一次结果', async () => {
    mockBackend()
    const store = useParseStore()
    store.input = MID
    await store.parse()
    expect(store.resolved).toBe(2)

    store.input = 'anotherMid001'
    await store.parse()
    expect(store.mid).toBe('anotherMid001')
    expect(store.resolved).toBe(2)
  })

  it('单条重试只刷新目标音质', async () => {
    const fetchMock = mockBackend()
    const store = useParseStore()
    store.input = MID
    await store.parse()
    expect(store.qualities.C200?.status).toBe('err')
    const resolvedBefore = store.qualities.F000

    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.startsWith('/song/urls')) {
        const params = new URL(`http://x${url}`).searchParams
        const type = params.get('type') ?? ''
        const key = params.get('mids') ?? MID
        return type === 'C200'
          ? jsonResponse({ [key]: { url: 'https://cdn.example/C200.m4a' } })
          : jsonResponse({ [key]: { error: '仍不可用' } })
      }
      return jsonResponse({})
    })

    await store.retryQuality('C200')

    expect(store.qualities.C200).toEqual({
      status: 'ok',
      url: 'https://cdn.example/C200.m4a',
    })
    expect(store.qualities.F000).toEqual(resolvedBefore)
  })
})
