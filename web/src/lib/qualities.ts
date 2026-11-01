/** 17 种音质目录，与后端 SongFileType 一一对应（顺序即展示顺序）。 */
export type QualityGroup = 'hires' | 'lossless' | 'lossy'
export type QualityExt = 'flac' | 'ogg' | 'mp3' | 'm4a' | 'mp4' | 'nac'

export interface Quality {
  code: string
  label: string
  /** 分组，用于列表分区着色 */
  group: QualityGroup
  /** 落盘扩展名，与 src/modules/song_filetype.js 一致 */
  ext: QualityExt
  /** 保真层级，越小越高；等于目录顺序 */
  rank: number
}

const CATALOG: readonly Omit<Quality, 'rank'>[] = [
  { code: 'DT03', label: 'DTS:X', group: 'hires', ext: 'mp4' },
  { code: 'AI00', label: '臻品母带', group: 'hires', ext: 'flac' },
  { code: 'Q000', label: '臻品音质', group: 'hires', ext: 'flac' },
  { code: 'Q001', label: '臻品全景声 5.1', group: 'hires', ext: 'flac' },
  { code: 'Q003', label: '臻品全景声 7.1', group: 'hires', ext: 'ogg' },
  { code: 'D004', label: '杜比全景声', group: 'hires', ext: 'mp4' },
  { code: 'TL01', label: 'AICodec', group: 'hires', ext: 'nac' },
  { code: 'F000', label: 'SQ 无损', group: 'lossless', ext: 'flac' },
  { code: 'O801', label: 'OGG 640', group: 'lossless', ext: 'ogg' },
  { code: 'O800', label: 'OGG 320', group: 'lossless', ext: 'ogg' },
  { code: 'O600', label: 'OGG 192', group: 'lossy', ext: 'ogg' },
  { code: 'O400', label: 'OGG 96', group: 'lossy', ext: 'ogg' },
  { code: 'M800', label: 'MP3 320', group: 'lossy', ext: 'mp3' },
  { code: 'M500', label: 'MP3 128', group: 'lossy', ext: 'mp3' },
  { code: 'C600', label: 'AAC 192', group: 'lossy', ext: 'm4a' },
  { code: 'C400', label: 'AAC 96', group: 'lossy', ext: 'm4a' },
  { code: 'C200', label: 'AAC 48', group: 'lossy', ext: 'm4a' },
]

export const QUALITIES: readonly Quality[] = CATALOG.map((quality, index) => ({
  ...quality,
  rank: index,
}))

export const QUALITY_TOTAL = QUALITIES.length

/** 首选音质缺省档：SQ 无损 */
export const DEFAULT_PREFERRED_CODE = 'F000'

/** ADR 0002 的降级阶梯；hires 组永不自动进入 */
export const FALLBACK_LADDER: readonly string[] = ['F000', 'O801', 'O800', 'M800', 'M500']

/** 直链探测状态，与 parse store 的 UrlStatus 同构（此处不依赖 store，避免循环引用） */
export type ProbeStatus = 'idle' | 'loading' | 'ok' | 'err'

export interface PreferredResolution {
  code: string
  /** 发生降级时的原首选档；未降级为 null */
  fellBackFrom: string | null
}

export function qualityOf(code: string): Quality | undefined {
  return QUALITIES.find((quality) => quality.code === code)
}

/** 从首选档出发的探测 / 降级顺序；阶梯外的档（含 hires）先试它自己，再退回阶梯 */
export function ladderFrom(preferred: string): readonly string[] {
  const index = FALLBACK_LADDER.indexOf(preferred)
  return index >= 0 ? FALLBACK_LADDER.slice(index) : [preferred, ...FALLBACK_LADDER]
}

/** 在已探测状态里挑实际可下载的那一档；一个都没 ok 时返回 null */
export function resolvePreferred(
  status: Record<string, ProbeStatus>,
  preferred: string,
): PreferredResolution | null {
  for (const code of ladderFrom(preferred)) {
    if (status[code] === 'ok') return { code, fellBackFrom: code === preferred ? null : preferred }
  }
  return null
}

export function sortByRank<T extends { code: string }>(items: readonly T[]): T[] {
  const rankOf = (code: string): number => qualityOf(code)?.rank ?? Number.MAX_SAFE_INTEGER
  return [...items].sort((a, b) => rankOf(a.code) - rankOf(b.code))
}
