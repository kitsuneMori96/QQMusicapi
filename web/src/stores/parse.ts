import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getSongDetail, getSongLyric, getSongSimilar, getSongUrl } from '@/api/song'
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

  let seq = 0

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

  async function loadUrls(songMid: string, token: number): Promise<void> {
    await Promise.all(
      QUALITIES.map(async (q) => {
        try {
          const map = await getSongUrl(songMid, q.code)
          if (token !== seq) return
          const info: PlayUrlInfo | undefined = map[songMid]
          if (info?.url) {
            setQuality(q.code, { status: 'ok', url: info.url, error: undefined })
          } else {
            setQuality(q.code, { status: 'err', error: info?.error || '无可用直链' })
          }
        } catch (error) {
          if (token !== seq) return
          setQuality(q.code, { status: 'err', error: errText(error) })
        }
      }),
    )
  }

  async function loadLyric(songMid: string, token: number): Promise<void> {
    lyricLoading.value = true
    try {
      const data = await getSongLyric(songMid, true)
      if (token !== seq) return
      lyric.value = data
    } catch (error) {
      if (token !== seq) return
      lyric.value = { decodeError: errText(error) }
    } finally {
      if (token === seq) lyricLoading.value = false
    }
  }

  async function loadSimilar(songid: string | number, token: number): Promise<void> {
    similarLoading.value = true
    try {
      const data = await getSongSimilar(songid)
      if (token !== seq) return
      similar.value = toSimilar(data.list ?? [])
    } catch {
      if (token !== seq) return
      // 相似曲目失败不致命，保持空列表
      similar.value = []
    } finally {
      if (token === seq) similarLoading.value = false
    }
  }

  async function parse(): Promise<void> {
    const notice = useNoticeStore()
    const candidate = extractMid(input.value)
    if (!candidate) {
      notice.warn('无法识别 songmid', '支持 songDetail 链接 / songmid=参数 / 直接输入 10–20 位 mid')
      return
    }

    const token = ++seq
    reset()
    mid.value = candidate
    phase.value = 'parsing'
    qualities.value = loadingQualities()

    // 1) 详情：失败只置 detailError，不阻断后续
    try {
      const detail = await getSongDetail(candidate)
      if (token !== seq) return
      track.value = detail.tracks?.[0] ?? null
    } catch (error) {
      if (token !== seq) return
      detailError.value = errText(error)
    }

    // 2) 直链 / 歌词 / 相似 并行
    const jobs: Array<Promise<void>> = [loadUrls(candidate, token), loadLyric(candidate, token)]
    const songid = track.value?.id
    if (songid !== undefined && songid !== null) {
      jobs.push(loadSimilar(songid, token))
    }

    await Promise.allSettled(jobs)
    if (token !== seq) return

    phase.value = detailError.value && resolved.value === 0 ? 'error' : 'ready'
    if (phase.value === 'error') {
      notice.error('解析失败', detailError.value)
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
    resolved,
    canParse,
    reset,
    setQuality,
    parse,
    urlOf,
  }
})
