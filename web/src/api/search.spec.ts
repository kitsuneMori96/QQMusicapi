import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchAlbum, searchSong, searchSonglist } from './search'

function envelope(data: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string | URL | Request) => ({
      status: 200,
      text: async () => JSON.stringify({ code: 0, message: 'ok', data }),
    })),
  )
}

function lastUrl(): string {
  const fetchMock = vi.mocked(fetch)
  return String(fetchMock.mock.calls.at(-1)?.[0])
}

describe('search api', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('关键词与分页参数都进了 query 且被编码', async () => {
    envelope({ keyword: '周杰伦', page: 2, num: 20, total: 0, items: [] })
    await expect(searchSong('周杰伦 晴天', 2, 20)).resolves.toMatchObject({ page: 2 })
    const url = decodeURIComponent(lastUrl())
    expect(url).toContain('/search/song?')
    expect(url).toContain('keyword=周杰伦 晴天')
    expect(url).toContain('page=2')
    expect(url).toContain('num=20')
  })

  it('缺省用第 1 页 20 条', async () => {
    envelope({ items: [] })
    await searchSong('晴天')
    expect(lastUrl()).toContain('page=1')
    expect(lastUrl()).toContain('num=20')
  })

  it('专辑与歌单各走自己的端点', async () => {
    envelope({ items: [] })
    await searchAlbum('晴天')
    expect(lastUrl()).toContain('/search/album?')

    await searchSonglist('晴天')
    expect(lastUrl()).toContain('/search/songlist?')
  })
})
