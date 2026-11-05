import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseContentDispositionFilename } from './http'
import {
  downloadLyric,
  downloadSong,
  downloadUrl,
  getSongLyric,
  getSongSimilar,
  getSongUrl,
} from './song'

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

  it('Content-Disposition 文件名：RFC 5987 优先且可解码', () => {
    expect(parseContentDispositionFilename(null)).toBe('')
    expect(parseContentDispositionFilename('attachment; filename="a.flac"')).toBe('a.flac')
    expect(
      parseContentDispositionFilename(
        "attachment; filename=\"fallback.flac\"; filename*=UTF-8''%E6%99%B4%E5%A4%A9.flac",
      ),
    ).toBe('晴天.flac')
  })

  it('下载失败时抛出后端 message，不触发保存', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ code: 404, message: '歌曲无版权' }),
      })),
    )

    await expect(downloadSong({ mid: 'mid1', code: 'F000' })).rejects.toMatchObject({
      message: '歌曲无版权',
      status: 404,
    })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('下载成功时按响应头文件名保存并释放 objectURL', async () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-disposition'
              ? "attachment; filename*=UTF-8''%E6%99%B4%E5%A4%A9.flac"
              : null,
        },
        blob: async () => new Blob(['audio']),
      })),
    )

    await expect(downloadSong({ mid: 'mid1', code: 'F000' })).resolves.toBe('晴天.flac')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(document.querySelector('a[download="晴天.flac"]')).toBeNull()

    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    click.mockRestore()
    vi.useRealTimers()
  })

  it('下载把档位写进地址并把进度透传给上层', async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock'),
      configurable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const fetchMock = vi.fn(async (_input: string | URL | Request) => ({
      ok: true,
      status: 200,
      body: null,
      headers: { get: (_name: string) => null },
      blob: async () => new Blob(['audio']),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const onProgress = vi.fn()
    await expect(downloadSong({ mid: '0039MnYb0qxYhV', code: 'F000', onProgress })).resolves.toMatch(
      /^download-\d+$/,
    )
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/song/download?mid=0039MnYb0qxYhV&type=F000',
    )
    expect(onProgress).toHaveBeenCalledWith({ received: 5, total: 5 })
    click.mockRestore()
  })

  it('歌词下载请求带 kind 与 download=1，落盘名来自响应头', async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock'),
      configurable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const fetchMock = vi.fn(async (_input: string | URL | Request) => ({
      ok: true,
      status: 200,
      body: null,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-disposition'
            ? "attachment; filename*=UTF-8''%E5%8D%81%E5%B9%B4%20-%20%E9%99%88%E5%A5%95%E8%BF%85.lrc"
            : null,
      },
      blob: async () => new Blob(['[00:00.000]十年\n']),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(downloadLyric('0039MnYb0qxYhV', 'trans')).resolves.toBe('十年 - 陈奕迅.lrc')
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/song/lyric?mid=0039MnYb0qxYhV&decode=1&kind=trans&download=1',
    )
    expect(click).toHaveBeenCalledTimes(1)
    click.mockRestore()
  })

  it('歌词下载失败时抛出后端 message，不触发保存', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ code: 404, message: '这首歌没有这一轨歌词' }),
      })),
    )

    await expect(downloadLyric('mid1', 'roma')).rejects.toMatchObject({
      message: '这首歌没有这一轨歌词',
      status: 404,
    })
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
