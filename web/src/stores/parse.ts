import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LyricData, SongUrlInfo, Track } from '@/api/types'
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

function emptyQualities(): Record<string, QualityState> {
  return Object.fromEntries(QUALITIES.map((q) => [q.code, { status: 'idle' as UrlStatus }]))
}

/**
 * 解析页状态。传输层待 src/contracts 落地后接入（见 parse()）。
 */
export const useParseStore = defineStore('parse', () => {
  const input = ref('')
  const phase = ref<ParsePhase>('idle')
  const mid = ref('')
  const track = ref<Track | null>(null)
  const detailError = ref('')
  const qualities = ref<Record<string, QualityState>>(emptyQualities())
  const lyric = ref<LyricData | null>(null)
  const similar = ref<Array<{ id?: number; mid?: string; name?: string; singer?: string }>>([])

  const resolved = computed(() => QUALITIES.filter((q) => qualities.value[q.code]?.status === 'ok').length)
  const canParse = computed(() => extractMid(input.value) !== '')

  function reset(): void {
    phase.value = 'idle'
    mid.value = ''
    track.value = null
    detailError.value = ''
    qualities.value = emptyQualities()
    lyric.value = null
    similar.value = []
  }

  function setQuality(code: string, patch: Partial<QualityState>): void {
    const current = qualities.value[code] ?? { status: 'idle' as UrlStatus }
    qualities.value = { ...qualities.value, [code]: { ...current, ...patch } }
  }

  /**
   * 占位：解析接口尚未接入。
   * 接入时在此并发请求 detail / urls×17 / lyric / similar，并把结果写入本 store，
   * QUALITIES 的逐项状态由 setQuality 维护。
   */
  async function parse(): Promise<void> {
    const notice = useNoticeStore()
    const candidate = extractMid(input.value)
    if (!candidate) {
      notice.warn('无法识别 songmid', '支持 songDetail 链接 / songmid=参数 / 直接输入 10–20 位 mid')
      return
    }
    reset()
    mid.value = candidate
    phase.value = 'error'
    detailError.value = '接口层尚未接入（等待 src/contracts）'
    notice.info('已识别 songmid', `${candidate} · 数据接口待接入`)
  }

  /** 供后续 APlayer 播放使用 */
  function urlOf(code: string): SongUrlInfo | undefined {
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
    similar,
    resolved,
    canParse,
    reset,
    setQuality,
    parse,
    urlOf,
  }
})
