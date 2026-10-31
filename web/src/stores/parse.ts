import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'
import { isAbortError } from '@/api/http'
import {
  downloadSong,
  getSongDetail,
  getSongLyric,
  getSongSimilar,
  getSongUrl,
} from '@/api/song'
import type { LyricData, PlayUrlInfo, SongTrack, Track } from '@/api/contracts'
import { extractMid } from '@/lib/mid'
import { QUALITIES } from '@/lib/qualities'
import { useNoticeStore } from './notice'

export type ParsePhase = 'idle' | 'parsing' | 'ready' | 'error'
export type UrlStatus = 'idle' | 'loading' | 'ok' | 'err'

export interface QualityState {
  status: UrlStatus
  url?: string
  error?: string
}

export interface SimilarEntry {
  id?: number | string
  mid?: string
  name?: string
  singer?: string
}

function emptyQualities(): Record<string, QualityState> {
  return Object.fromEntries(QUALITIES.map((q) => [q.code, { status: 'idle' as UrlStatus }]))
}

function loadingQualities(): Record<string, QualityState> {
  return Object.fromEntries(QUALITIES.map((q) => [q.code, { status: 'loading' as UrlStatus }]))
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toSimilar(tracks: SongTrack[]): SimilarEntry[] {
  return tracks.slice(0, 20).map((t) => ({
    id: t.id,
    mid: t.mid,
    name: t.name,
    singer: (t.singer ?? [])
      .map((s) => s.name ?? '')
      .filter(Boolean)
      .join(' / '),
  }))
}

/**
 * 解析页状态：详情 / 17 音质直链 / 歌词 / 相似曲目。
 *
 * 并发策略与旧页一致：详情失败不阻断后续；歌词、相似、直链互不阻塞。
 * 用 seq 令牌丢弃过期请求结果，避免连续解析时旧响应覆盖新曲目。
 */
export const useParseStore = defineStore('parse', () => {
  const input = ref('')
  const phase = ref<ParsePhase>('idle')
  const mid = ref('')
  const track = ref<Track | null>(null)
  const detailError = ref('')
  const qualities = ref<Record<string, QualityState>>(emptyQualities())
  const lyric = ref<LyricData | null>(null)
  const lyricLoading = ref(false)
  const similar = ref<SimilarEntry[]>([])
  const similarLoading = ref(false)
  const downloading = ref<Record<string, boolean>>({})

  let seq = 0
  let controller: AbortController | null = null

  onScopeDispose(() => {
    controller?.abort()
    controller = null
  })

  const resolved = computed(
    () => QUALITIES.filter((q) => qualities.value[q.code]?.status === 'ok').length,
  )
  const canParse = computed(() => extractMid(input.value) !== '')

  function reset(): void {
    phase.value = 'idle'
    mid.value = ''
    track.value = null
    detailError.value = ''
    qualities.value = emptyQualities()
    lyric.value = null
    lyricLoading.value = false
    similar.value = []
    similarLoading.value = false
  }

  function setQuality(code: string, patch: Partial<QualityState>): void {
    const current = qualities.value[code] ?? { status: 'idle' as UrlStatus }
    qualities.value = { ...qualities.value, [code]: { ...current, ...patch } }
  }

  async function loadUrls(songMid: string, token: number, signal?: AbortSignal): Promise<void> {
    await Promise.all(
      QUALITIES.map(async (q) => {
        try {
          const map = await getSongUrl(songMid, q.code, signal)
          if (token !== seq) return
          const info: PlayUrlInfo | undefined = map[songMid]
          if (info?.url) {
            setQuality(q.code, { status: 'ok', url: info.url, error: undefined })
          } else {
            setQuality(q.code, { status: 'err', url: undefined, error: info?.error || '无可用直链' })
          }
        } catch (error) {
          if (token !== seq || isAbortError(error)) return
          setQuality(q.code, { status: 'err', url: undefined, error: errText(error) })
        }
      }),
    )
  }

  async function loadLyric(
    songMid: string,
    token: number,
    signal?: AbortSignal,
  ): Promise<void> {
    lyricLoading.value = true
    try {
      const data = await getSongLyric(songMid, true, signal)
      if (token !== seq) return
      lyric.value = data
    } catch (error) {
      if (token !== seq || isAbortError(error)) return
      lyric.value = { decodeError: errText(error) }
    } finally {
      if (token === seq) lyricLoading.value = false
    }
  }

  async function loadSimilar(
    songid: string | number,
    token: number,
    signal?: AbortSignal,
  ): Promise<void> {
    similarLoading.value = true
    try {
      const data = await getSongSimilar(songid, signal)
      if (token !== seq) return
      similar.value = toSimilar(data.list ?? [])
    } catch (error) {
      if (token !== seq || isAbortError(error)) return
      // 相似曲目失败不致命，保持空列表
      similar.value = []
    } finally {
      if (token === seq) similarLoading.value = false
    }
  }

  async function parse(): Promise<boolean> {
    const notice = useNoticeStore()
    const candidate = extractMid(input.value)
    if (!candidate) {
      notice.warn('无法识别 songmid', '支持 songDetail 链接 / songmid=参数 / 直接输入 10–20 位 mid')
      return false
    }

    // 取消上一次解析：旧请求不再占用连接，也不会在 seq 兜底之外产生错误提示
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal

    const token = ++seq
    reset()
    mid.value = candidate
    phase.value = 'parsing'
    qualities.value = loadingQualities()

    // 1) 详情：失败只置 detailError，不阻断后续
    try {
      const detail = await getSongDetail(candidate, signal)
      if (token !== seq) return false
      track.value = detail.tracks?.[0] ?? null
    } catch (error) {
      if (token !== seq || isAbortError(error)) return false
      detailError.value = errText(error)
    }

    // 2) 直链 / 歌词 / 相似 并行
    const jobs: Array<Promise<void>> = [
      loadUrls(candidate, token, signal),
      loadLyric(candidate, token, signal),
    ]
    const songid = track.value?.id
    if (songid !== undefined && songid !== null) {
      jobs.push(loadSimilar(songid, token, signal))
    }

    await Promise.allSettled(jobs)
    if (token !== seq) return false

    phase.value = detailError.value && resolved.value === 0 ? 'error' : 'ready'
    if (phase.value === 'error') {
      notice.error('解析失败', detailError.value)
    }
    return phase.value === 'ready'
  }

  /** 单条音质重试：只刷新目标行，不打断其他结果 */
  async function retryQuality(code: string): Promise<void> {
    if (!mid.value || phase.value === 'parsing') return

    const token = seq
    const songMid = mid.value
    setQuality(code, { status: 'loading', error: undefined })
    try {
      const map = await getSongUrl(songMid, code, controller?.signal)
      if (token !== seq) return
      const info: PlayUrlInfo | undefined = map[songMid]
      if (info?.url) {
        setQuality(code, { status: 'ok', url: info.url, error: undefined })
      } else {
        setQuality(code, { status: 'err', url: undefined, error: info?.error || '无可用直链' })
      }
    } catch (error) {
      if (token !== seq || isAbortError(error)) return
      setQuality(code, { status: 'err', url: undefined, error: errText(error) })
    }
  }

  /** 批量重试当前所有失败行 */
  async function retryFailed(): Promise<void> {
    const codes = QUALITIES.filter((q) => qualities.value[q.code]?.status === 'err').map(
      (q) => q.code,
    )
    await Promise.all(codes.map((code) => retryQuality(code)))
  }

  /** 下载：fetch 校验后再触发保存，错误走 notice 而不是跳转页面 */
  async function download(code: string): Promise<void> {
    if (!mid.value || downloading.value[code]) return

    const notice = useNoticeStore()
    const songMid = mid.value
    downloading.value = { ...downloading.value, [code]: true }
    try {
      const filename = await downloadSong(songMid, code)
      notice.success(`已开始保存：${filename}`)
    } catch (error) {
      if (!isAbortError(error)) notice.error('下载失败', errText(error))
    } finally {
      const next = { ...downloading.value }
      delete next[code]
      downloading.value = next
    }
  }

  /** 供播放器取当前音质直链 */
  function urlOf(code: string): PlayUrlInfo | undefined {
    const state = qualities.value[code]
    if (!state || state.status !== 'ok' || !state.url) return undefined
    return { url: state.url }
  }

  return {
    input,
    phase,
    mid,
    track,
    detailError,
    qualities,
    lyric,
    lyricLoading,
    similar,
    similarLoading,
    downloading,
    resolved,
    canParse,
    reset,
    setQuality,
    parse,
    retryQuality,
    retryFailed,
    download,
    urlOf,
  }
})
