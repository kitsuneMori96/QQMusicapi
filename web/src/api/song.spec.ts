import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadUrl, getSongLyric, getSongSimilar, getSongUrl } from './song'

function mockFetch(data: unknown) {
  const fetchMock = vi.fn(async (_input: string | URL | Request) => ({
    status: 200,
    text: async () => JSON.stringify({ code: 0, message: 'ok', data }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function lastUrl(fetchMock: ReturnType<typeof mockFetch>): string {
  return String(fetchMock.mock.calls.at(-1)?.[0])
}

describe('song api', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('歌词请求固定带 decode=1 与 format=text', async () => {
    const fetchMock = mockFetch({ lyric: '[00:00.000]x' })
    await getSongLyric('002kR3lm1nTxkV')
    const url = lastUrl(fetchMock)
    expect(url).toContain('/song/lyric?mid=002kR3lm1nTxkV')
    expect(url).toContain('decode=1')
    expect(url).toContain('format=text')
  })

  it('歌词可关闭解码', async () => {
    const fetchMock = mockFetch({})
    await getSongLyric('mid', false)
    expect(lastUrl(fetchMock)).toContain('decode=0')
  })

  it('直链与相似曲目参数正确编码', async () => {
    const fetchMock = mockFetch({})
    await getSongUrl('002kR3lm1nTxkV', 'F000')
    expect(lastUrl(fetchMock)).toBe('/song/urls?mids=002kR3lm1nTxkV&type=F000')

    await getSongSimilar(102065756)
    expect(lastUrl(fetchMock)).toBe('/song/similar?songid=102065756')
  })

  it('下载地址指向服务端代理端点', () => {
    expect(downloadUrl('abc123', 'F000')).toBe('/song/download?mid=abc123&type=F000')
  })
})
