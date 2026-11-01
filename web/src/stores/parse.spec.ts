import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useParseStore } from './parse'
import { useNoticeStore } from './notice'
import { DEFAULT_PREFERRED_CODE } from '@/lib/qualities'
import { savePreferredQuality } from '@/lib/preference'

const MID = '002kR3lm1nTxkV'

function jsonResponse(data: unknown): Response {
  return {
    status: 200,
    text: async () => JSON.stringify({ code: 0, message: 'ok', data }),
  } as unknown as Response
}

function mockBackend(
  options: {
    detailFails?: boolean
    allUrlsFail?: boolean
    okTypes?: readonly string[]
    resolveFails?: boolean
    resolveMid?: string
  } = {},
) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.startsWith('/song/resolve')) {
      if (options.resolveFails) {
        return {
          status: 400,
          text: async () =>
            JSON.stringify({ code: 400, message: '该分享链接不指向单曲（可能是歌单或专辑），暂不支持' }),
        } as unknown as Response
      }
      return jsonResponse({
        mid: options.resolveMid ?? MID,
        id: 123456,
        name: '测试曲目',
        singer: '甲 / 乙',
      })
    }
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
      const okTypes = options.okTypes ?? ['F000', 'M800']
      return jsonResponse(
        options.allUrlsFail
          ? { [key]: { error: '无版权' } }
          : okTypes.includes(type)
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
    localStorage.clear()
    savePreferredQuality(DEFAULT_PREFERRED_CODE)
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

  it('非 QQ 音乐域名的 URL 也不发请求', async () => {
    const fetchMock = mockBackend()
    const store = useParseStore()
    store.input = 'https://example.com/base/fcgi-bin/u?__=x'
    await store.parse()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.phase).toBe('idle')
  })

  it('c6 分享短链先解析出 mid 再走完整流程', async () => {
    const fetchMock = mockBackend()
    const store = useParseStore()
    store.input = 'https://c6.y.qq.com/base/fcgi-bin/u?__=rhEMMiIFAphR'
    await store.parse()

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls[0]).toContain('/song/resolve?url=')
    expect(store.canParse).toBe(true)
    expect(store.mid).toBe(MID)
    expect(store.phase).toBe('ready')
    expect(store.track?.name).toBe('测试曲目')
    // 首屏只探首选档，其他 16 档保持 idle
    expect(store.resolved).toBe(1)
    expect(store.primary).toEqual({ code: 'F000', fellBackFrom: null })
    expect(store.qualities.M800?.status).toBe('idle')
    expect(store.urlOf('M800')).toBeUndefined()
  })

  it('整段分享文案里的链接同样可用', async () => {
    mockBackend()
    const store = useParseStore()
    store.input = `分享周杰伦的歌曲《晴天》 https://c6.y.qq.com/base/fcgi-bin/u?__=rhEMMiIFAphR 快来听`
    await store.parse()
    expect(store.mid).toBe(MID)
    expect(store.phase).toBe('ready')
  })

  it('分享链接解析失败 -> error 并提示，不再请求详情与直链', async () => {
    const fetchMock = mockBackend({ resolveFails: true })
    const store = useParseStore()
    store.input = 'https://c6.y.qq.com/base/fcgi-bin/u?__=albumshare'
    await store.parse()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/song/resolve')
    expect(store.phase).toBe('error')
    expect(store.mid).toBe('')
    expect(store.detailError).toContain('不指向单曲')
    expect(useNoticeStore().items.some((n) => n.level === 'error')).toBe(true)
  })

  it('首屏只探测首选档，详情 / 歌词 / 相似照常', async () => {
    const fetchMock = mockBackend()
    const store = useParseStore()
    store.input = `https://y.qq.com/n/ryqq/songDetail/${MID}`
    await store.parse()

    const urlCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.startsWith('/song/urls'))
    expect(urlCalls).toHaveLength(1)
    expect(urlCalls[0]).toContain('type=F000')

    expect(store.mid).toBe(MID)
    expect(store.phase).toBe('ready')
    expect(store.track?.name).toBe('测试曲目')
    expect(store.qualities.F000).toEqual({ status: 'ok', url: 'https://cdn.example/F000.flac' })
    expect(store.qualities.C200?.status).toBe('idle')
    expect(store.resolved).toBe(1)
    expect(store.primary).toEqual({ code: 'F000', fellBackFrom: null })
    expect(store.lyric?.lyric).toContain('歌词')
    expect(store.similar.map((s) => s.singer)).toEqual(['丙', '丁 / 戊'])
    expect(store.urlOf('F000')?.url).toContain('F000.flac')
    expect(store.urlOf('C200')).toBeUndefined()
  })

  it('首选档不可取时按阶梯降级，hires 不进降级路径', async () => {
    const fetchMock = mockBackend({ okTypes: ['O800'] })
    const store = useParseStore()
    store.input = MID
    await store.parse()

    const types = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.startsWith('/song/urls'))
      .map((url) => new URL(`http://x${url}`).searchParams.get('type'))
    expect(types).toEqual(['F000', 'O801', 'O800'])
    expect(store.primary).toEqual({ code: 'O800', fellBackFrom: 'F000' })
    expect(store.fellBackFrom).toBe('F000')
    expect(store.qualities.DT03?.status).toBe('idle')
  })

  it('展开其他音质时只补探未碰过的档位', async () => {
    const fetchMock = mockBackend()
    const store = useParseStore()
    store.input = MID
    await store.parse()

    await store.probeOthers()
    const types = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.startsWith('/song/urls'))
      .map((url) => new URL(`http://x${url}`).searchParams.get('type'))
    // 首选 F000 不重复探测，其余 16 档各一次
    expect(types).toHaveLength(17)
    expect(types.filter((type) => type === 'F000')).toHaveLength(1)
    expect(store.qualities.C200?.status).toBe('err')
    expect(store.qualities.DT03?.status).toBe('err')
  })

  it('详情失败不阻断首选档与歌词', async () => {
    mockBackend({ detailFails: true })
    const store = useParseStore()
    store.input = MID
    await store.parse()

    expect(store.detailError).toContain('上游超时')
    expect(store.track).toBeNull()
    expect(store.phase).toBe('ready')
    expect(store.resolved).toBe(1)
    expect(store.primary?.code).toBe('F000')
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
    expect(store.resolved).toBe(1)

    store.input = 'anotherMid001'
    await store.parse()
    expect(store.mid).toBe('anotherMid001')
    expect(store.resolved).toBe(1)
  })

  it('ensureProbed 已 ok 不重复请求，idle 探测后才可播放', async () => {
    const fetchMock = mockBackend()
    const store = useParseStore()
    store.input = MID
    await store.parse()

    expect(await store.ensureProbed('F000')).toBe(true)
    expect(
      fetchMock.mock.calls.filter(
        (call) =>
          String(call[0]).startsWith('/song/urls') && String(call[0]).includes('type=F000'),
      ),
    ).toHaveLength(1)

    expect(await store.ensureProbed('M800')).toBe(true)
    expect(store.qualities.M800?.status).toBe('ok')
    expect(store.urlOf('M800')?.url).toContain('M800.flac')
  })

  it('切换首选音质写入偏好并探测新档位', async () => {
    mockBackend()
    const store = useParseStore()
    store.input = MID
    await store.parse()

    await store.setPreferred('M800')
    expect(store.preferred).toBe('M800')
    expect(localStorage.getItem('qqm.v1.preferredQuality')).toBe('M800')
    expect(store.qualities.M800?.status).toBe('ok')
    expect(store.primary).toEqual({ code: 'M800', fellBackFrom: null })
    expect(store.phase).toBe('ready')
  })

  it('切换首选音质期间保持 parsing，不闪错误态', async () => {
    mockBackend()
    const store = useParseStore()
    store.input = MID
    await store.parse()

    const switching = store.setPreferred('O801')
    // 新首选档还在探测：phase 必须是 parsing，避免 UI 把 primary=null 当失败
    expect(store.phase).toBe('parsing')
    expect(store.primary).toBeNull()

    await switching
    expect(store.phase).toBe('ready')
    expect(store.primary).toEqual({ code: 'M800', fellBackFrom: 'O801' })
  })

  it('单条重试只刷新目标音质', async () => {
    const fetchMock = mockBackend()
    const store = useParseStore()
    store.input = MID
    await store.parse()
    await store.probeOthers()
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
