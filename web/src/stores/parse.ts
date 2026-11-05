import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'
import { isAbortError, probeDirectLink } from '@/api/http'
import {
  downloadLyric,
  getSongDetail,
  getSongLyric,
  getSongSimilar,
  getSongUrl,
  resolveShareLink,
  type LyricKind,
} from '@/api/song'
import type { LyricData, PlayUrlInfo, SongTrack, Track } from '@/api/contracts'
import { extractMid, extractShareUrl } from '@/lib/mid'
import { loadPreferredQuality, savePreferredQuality } from '@/lib/preference'
import {
  QUALITIES,
  ladderFrom,
  qualityOf,
  resolvePreferred,
  type ProbeStatus,
} from '@/lib/qualities'
import { useNoticeStore } from './notice'

export type ParsePhase = 'idle' | 'parsing' | 'ready' | 'error'
export type UrlStatus = ProbeStatus

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
 * 解析页状态：详情 / 首选音质探测 / 歌词 / 相似曲目。
 *
 * 下载优先：首屏只探 `ladderFrom(preferred)[0]` 并按阶梯降级，其余档位等
 * 「其他音质」展开后由 probeOthers 补探。新解析会 abort 上一次请求，
 * seq 令牌兜底丢弃过期结果。
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
  const lyricSaving = ref(false)
  const similar = ref<SimilarEntry[]>([])
  const similarLoading = ref(false)
  const preferred = ref(loadPreferredQuality())
  /** 已发起过探测的档位：展开「其他音质」时只补探没碰过的，失败行交给单条重试 */
  const probed = ref<Record<string, boolean>>({})

  let seq = 0
  let controller: AbortController | null = null
  const inFlight = new Map<string, Promise<boolean>>()

  const probeStatus = computed<Record<string, ProbeStatus>>(() => {
    const map: Record<string, ProbeStatus> = {}
    for (const q of QUALITIES) map[q.code] = qualities.value[q.code]?.status ?? 'idle'
    return map
  })
  /** 实际可下载的首选档；未探测完或全阶梯失败时为 null */
  const primary = computed(() => resolvePreferred(probeStatus.value, preferred.value))
  /** 降级发生时的原首选档，供主按钮副标题提示 */
  const fellBackFrom = computed(() => primary.value?.fellBackFrom ?? null)

  onScopeDispose(() => {
    controller?.abort()
    controller = null
  })

  const resolved = computed(
    () => QUALITIES.filter((q) => qualities.value[q.code]?.status === 'ok').length,
  )
  const canParse = computed(
    () => extractMid(input.value) !== '' || extractShareUrl(input.value) !== '',
  )

  function reset(): void {
    phase.value = 'idle'
    mid.value = ''
    track.value = null
    detailError.value = ''
    qualities.value = emptyQualities()
    probed.value = {}
    inFlight.clear()
    lyric.value = null
    lyricLoading.value = false
    lyricSaving.value = false
    similar.value = []
    similarLoading.value = false
  }

  function setQuality(code: string, patch: Partial<QualityState>): void {
    const current = qualities.value[code] ?? { status: 'idle' as UrlStatus }
    qualities.value = { ...qualities.value, [code]: { ...current, ...patch } }
  }

  /** 探测单个档位，写回状态；过期 token / 主动取消都返回 false */
  async function probeQuality(
    code: string,
    token: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const songMid = mid.value
    if (!songMid || token !== seq) return false

    probed.value = { ...probed.value, [code]: true }
    setQuality(code, { status: 'loading', url: undefined, error: undefined })
    try {
      const map = await getSongUrl(songMid, code, signal)
      if (token !== seq) return false
      const info: PlayUrlInfo | undefined = map[songMid]
      if (info?.url) {
        // 有 url ≠ 取得出：上游会给一条 404 的直链（如 OGG 档未上传），
        // 直接当 ok 会让播放器在 media 元素上报 MEDIA_ERR_SRC_NOT_SUPPORTED
        if (!(await probeDirectLink(info.url))) {
          if (token !== seq) return false
          setQuality(code, {
            status: 'err',
            url: undefined,
            error: '直链不可用（CDN 404），已跳过该档',
          })
          return false
        }
        setQuality(code, { status: 'ok', url: info.url, error: undefined })
        return true
      }
      setQuality(code, { status: 'err', url: undefined, error: info?.error || '无可用直链' })
      return false
    } catch (error) {
      if (token !== seq || isAbortError(error)) return false
      setQuality(code, { status: 'err', url: undefined, error: errText(error) })
      return false
    }
  }

  /**
   * 播放 / 单条重试前的保险：已 ok 直接成功，在途请求复用，idle/err 才真正发请求。
   */
  function ensureProbed(code: string): Promise<boolean> {
    if (!mid.value || !qualityOf(code)) return Promise.resolve(false)
    if (qualities.value[code]?.status === 'ok') return Promise.resolve(true)

    const pending = inFlight.get(code)
    if (pending) return pending

    const token = seq
    const promise = probeQuality(code, token, controller?.signal).finally(() => {
      if (inFlight.get(code) === promise) inFlight.delete(code)
    })
    inFlight.set(code, promise)
    return promise
  }

  /** 从某一档开始按降级阶梯顺序探测，命中即停；阶梯外档位先试自己再回阶梯 */
  async function probeLadderFrom(startCode: string): Promise<void> {
    const token = seq
    const tried = new Set<string>()
    for (const code of ladderFrom(startCode)) {
      if (token !== seq) return
      if (tried.has(code)) continue
      tried.add(code)
      if (await ensureProbed(code)) return
    }
  }

  /**
   * 展开「其他音质」时才并发探测：跳过当前 primary 与已探测过的档位。
   * 失败行不在这里自动重试，交给「重试 / 重试失败」。
   */
  async function probeOthers(): Promise<void> {
    if (!mid.value) return
    const primaryCode = primary.value?.code
    const targets = QUALITIES.filter(
      (q) =>
        q.code !== primaryCode &&
        !probed.value[q.code] &&
        (qualities.value[q.code]?.status ?? 'idle') === 'idle',
    ).map((q) => q.code)
    await Promise.all(targets.map((code) => ensureProbed(code)))
  }

  /** 切换首选音质：持久化后重新走降级阶梯；已 ok 的档位不会重复请求 */
  async function setPreferred(code: string): Promise<void> {
    if (!qualityOf(code)) return
    preferred.value = code
    savePreferredQuality(code)
    if (!mid.value || phase.value === 'parsing') return

    // 新首选档探测期间复用 parsing 态：避免 primary 短暂为 null 时
    // 主按钮/副标题闪出「首选音质不可用」，也顺带挡住并发的重试。
    phase.value = 'parsing'
    try {
      await probeLadderFrom(code)
    } finally {
      if (phase.value === 'parsing') phase.value = primary.value ? 'ready' : 'error'
    }
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

  /** 把当前看着的那一轨存成 .lrc；结果只有成败两种，用通知条即可 */
  async function downloadLyricFile(kind: LyricKind): Promise<void> {
    if (!mid.value || lyricSaving.value) return
    const notice = useNoticeStore()
    lyricSaving.value = true
    try {
      const filename = await downloadLyric(mid.value, kind)
      notice.success('歌词已下载', filename)
    } catch (error) {
      if (!isAbortError(error)) notice.warn('歌词下载失败', errText(error))
    } finally {
      lyricSaving.value = false
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
    let candidate = extractMid(input.value)
    const shareUrl = candidate ? '' : extractShareUrl(input.value)
    if (!candidate && !shareUrl) {
      notice.warn(
        '无法识别 songmid',
        '支持 songDetail 链接 / 分享短链 / songmid=参数 / 直接输入 10–20 位 mid',
      )
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

    // 0) 短链 / playsong 链接先由后端跟随跳转换成 songmid
    if (!candidate && shareUrl) {
      try {
        const resolvedData = await resolveShareLink(shareUrl, signal)
        if (token !== seq) return false
        candidate = resolvedData.mid
        mid.value = candidate
      } catch (error) {
        if (token !== seq || isAbortError(error)) return false
        const message = errText(error)
        detailError.value = message
        phase.value = 'error'
        notice.error('分享链接解析失败', message)
        return false
      }
    }

    // 1) 详情：失败只置 detailError，不阻断后续
    try {
      const detail = await getSongDetail(candidate, signal)
      if (token !== seq) return false
      track.value = detail.tracks?.[0] ?? null
    } catch (error) {
      if (token !== seq || isAbortError(error)) return false
      detailError.value = errText(error)
    }

    // 2) 首屏只探测首选挡（含降级阶梯）；歌词 / 相似在折叠区并行拉取
    const jobs: Array<Promise<void>> = [
      probeLadderFrom(preferred.value),
      loadLyric(candidate, token, signal),
    ]
    const songid = track.value?.id
    if (songid !== undefined && songid !== null) {
      jobs.push(loadSimilar(songid, token, signal))
    }

    await Promise.allSettled(jobs)
    if (token !== seq) return false

    phase.value = detailError.value && !primary.value ? 'error' : 'ready'
    if (phase.value === 'error') {
      notice.error('解析失败', detailError.value)
    }
    return phase.value === 'ready'
  }

  /** 单条音质重试：只刷新目标行，不打断其他结果 */
  async function retryQuality(code: string): Promise<void> {
    if (!mid.value || phase.value === 'parsing') return
    await ensureProbed(code)
  }

  /** 批量重试当前所有失败行 */
  async function retryFailed(): Promise<void> {
    const codes = QUALITIES.filter((q) => qualities.value[q.code]?.status === 'err').map(
      (q) => q.code,
    )
    await Promise.all(codes.map((code) => retryQuality(code)))
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
    lyricSaving,
    downloadLyricFile,
    similar,
    similarLoading,
    preferred,
    probed,
    primary,
    fellBackFrom,
    resolved,
    canParse,
    reset,
    setQuality,
    parse,
    ensureProbed,
    probeOthers,
    setPreferred,
    retryQuality,
    retryFailed,
    urlOf,
  }
})
