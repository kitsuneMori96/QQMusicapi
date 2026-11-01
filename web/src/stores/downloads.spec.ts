import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/http'

const { downloadSong } = vi.hoisted(() => ({ downloadSong: vi.fn() }))
vi.mock('@/api/song', () => ({ downloadSong }))

import { useDownloadsStore } from './downloads'

/** run 是后台异步的，等几个微任务让它跑到当前阶段 */
async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('downloads store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    downloadSong.mockReset()
  })

  it('start 立刻返回任务 id，任务进入 transferring 且不会抛出', async () => {
    downloadSong.mockImplementation(() => new Promise(() => {}))
    const store = useDownloadsStore()

    const id = store.start({ mid: 'm1', code: 'F000', label: '晴天' })
    expect(id).toBe('dl-1')
    expect(store.tasks[0]).toMatchObject({ mid: 'm1', code: 'F000', label: '晴天', status: 'transferring' })
    expect(store.active).toHaveLength(1)
  })

  it('label 缺省用 mid · code', () => {
    downloadSong.mockImplementation(() => new Promise(() => {}))
    const store = useDownloadsStore()
    store.start({ mid: 'm1', code: 'M800' })
    expect(store.tasks[0]?.label).toBe('m1 · M800')
  })

  it('成功后落文件名并把 received 收到 total', async () => {
    downloadSong.mockImplementation(async (o: { onProgress?: (p: { received: number; total: number }) => void }) => {
      o.onProgress?.({ received: 500, total: 1000 })
      o.onProgress?.({ received: 1000, total: 1000 })
      return '晴天.flac'
    })
    const store = useDownloadsStore()
    const id = store.start({ mid: 'm1', code: 'F000' })
    await flush()

    expect(store.tasks[0]).toMatchObject({ status: 'done', filename: '晴天.flac', received: 1000, total: 1000 })
    expect(store.progressOf(id)).toBe(1)
    expect(store.last?.filename).toBe('晴天.flac')
  })

  it('进度上报驱动 progressOf，无 Content-Length 时返回 -1', async () => {
    downloadSong.mockImplementation(async (o: { onProgress?: (p: { received: number; total: number }) => void }) => {
      o.onProgress?.({ received: 30, total: 120 })
      return new Promise(() => {})
    })
    const store = useDownloadsStore()
    const id = store.start({ mid: 'm1', code: 'F000' })
    await flush()
    expect(store.progressOf(id)).toBeCloseTo(0.25)

    downloadSong.mockImplementation(async (o: { onProgress?: (p: { received: number; total: number }) => void }) => {
      o.onProgress?.({ received: 30, total: 0 })
      return new Promise(() => {})
    })
    const second = store.start({ mid: 'm2', code: 'F000' })
    await flush()
    expect(store.progressOf(second)).toBe(-1)
  })

  it('失败写进任务而不是抛出', async () => {
    downloadSong.mockRejectedValue(new ApiError('歌曲无版权', 404, 404))
    const store = useDownloadsStore()
    const id = store.start({ mid: 'm1', code: 'F000' })
    await flush()

    expect(store.tasks[0]).toMatchObject({ status: 'error', error: '歌曲无版权' })
    expect(store.progressOf(id)).toBe(-1)
  })

  it('凭证失效的失败会加前缀，全局提示仍由 main.ts 负责', async () => {
    downloadSong.mockRejectedValue(new ApiError('凭证已过期', 104401, 401))
    const store = useDownloadsStore()
    store.start({ mid: 'm1', code: 'F000' })
    await flush()

    expect(store.tasks[0]?.error).toBe('登录状态已失效：凭证已过期')
  })

  it('取消后状态是 canceled', async () => {
    downloadSong.mockImplementation(
      (_o: unknown) =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 0)
        }),
    )
    const store = useDownloadsStore()
    const id = store.start({ mid: 'm1', code: 'F000' })
    store.cancel(id)
    expect(store.tasks[0]?.status).toBe('canceled')

    vi.useFakeTimers()
    vi.advanceTimersByTime(1)
    vi.useRealTimers()
    await flush()
    expect(store.tasks[0]?.status).toBe('canceled')
  })

  it('同一 mid+code 的重复点击复用在途任务，不重发请求', async () => {
    downloadSong.mockImplementation(() => new Promise(() => {}))
    const store = useDownloadsStore()

    const first = store.start({ mid: 'm1', code: 'F000' })
    const second = store.start({ mid: 'm1', code: 'F000' })
    expect(second).toBe(first)
    expect(store.tasks).toHaveLength(1)
    expect(downloadSong).toHaveBeenCalledTimes(1)
    expect(store.inFlight('m1', 'F000')?.id).toBe(first)
  })

  it('已结束的档不挡重新下载', async () => {
    downloadSong.mockResolvedValue('a.flac')
    const store = useDownloadsStore()
    const first = store.start({ mid: 'm1', code: 'F000' })
    await flush()
    expect(store.tasks[0]?.status).toBe('done')

    const second = store.start({ mid: 'm1', code: 'F000' })
    expect(second).not.toBe(first)
    expect(store.inFlight('m1', 'M800')).toBeUndefined()
  })

  it('retry 复用同一个 id 并从零重跑', async () => {
    downloadSong.mockRejectedValueOnce(new ApiError('网络错误', -1, 0)).mockResolvedValue('a.flac')
    const store = useDownloadsStore()
    const id = store.start({ mid: 'm1', code: 'F000' })
    await flush()
    expect(store.tasks[0]).toMatchObject({ status: 'error', error: '网络错误' })

    store.retry(id)
    expect(store.tasks[0]).toMatchObject({ status: 'transferring', error: '', received: 0, total: 0 })
    await flush()
    expect(store.tasks[0]).toMatchObject({ status: 'done', filename: 'a.flac' })
    expect(store.tasks).toHaveLength(1)
  })

  it('进行中的任务不能 dismiss，完成/失败的可以；clearDone 保留错误条目', async () => {
    downloadSong.mockResolvedValue('a.flac')
    const store = useDownloadsStore()
    const running = store.start({ mid: 'm1', code: 'AI00' })
    store.dismiss(running)
    expect(store.tasks).toHaveLength(1)

    store.cancel(running)
    expect(store.tasks[0]?.status).toBe('canceled')

    const done = store.start({ mid: 'm2', code: 'F000' })
    await flush()
    expect(store.tasks.find((t) => t.id === done)?.status).toBe('done')

    downloadSong.mockRejectedValue(new ApiError('失败', 502, 502))
    const failed = store.start({ mid: 'm3', code: 'F000' })
    await flush()

    store.clearDone()
    expect(store.tasks.map((t) => t.id)).toEqual([failed])

    store.dismiss(failed)
    expect(store.tasks).toHaveLength(0)
  })
})
