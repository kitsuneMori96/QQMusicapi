import { beforeEach, describe, expect, it, vi } from 'vitest'
import { albumDetail, songlistDetail } from './collection'

function envelope(data: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status: 200,
      text: async () => JSON.stringify({ code: 0, message: 'ok', data }),
    })),
  )
}

function lastUrl(): string {
  const fetchMock = vi.mocked(fetch)
  return String(fetchMock.mock.calls.at(-1)?.[0])
}

describe('collection api', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('专辑详情带上 mid、页码与每页条数', async () => {
    envelope({ mid: '000MkMni19ClKG', items: [] })
    await albumDetail('000MkMni19ClKG')
    const url = lastUrl()
    expect(url).toContain('/album/detail?')
    expect(url).toContain('mid=000MkMni19ClKG')
    expect(url).toContain('page=1')
    expect(url).toContain('num=50')
  })

  it('歌单详情带上 dissid，默认每页 30 首', async () => {
    envelope({ id: '8231976688', items: [] })
    await songlistDetail('8231976688', 2)
    const url = lastUrl()
    expect(url).toContain('/songlist/detail?')
    expect(url).toContain('dissid=8231976688')
    expect(url).toContain('page=2')
    expect(url).toContain('num=30')
  })
})
