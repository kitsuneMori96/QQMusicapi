/**
 * 本地临时类型定义（等 src/contracts 落地后替换为 TypeBox 推导类型）。
 * 只描述已确定的服务端数据结构，不放业务逻辑。
 */

export interface HealthData {
  loggedIn: boolean
  musicid?: number | string
  expired?: boolean
  file?: string
  version?: string
}

export interface Singer {
  id?: number
  mid?: string
  name: string
}

export interface Album {
  id?: number
  mid?: string
  name?: string
}

export interface Track {
  id?: number
  mid?: string
  name?: string
  singer?: Singer[]
  album?: Album
  interval?: number
}

export interface SongDetailData {
  tracks: Track[]
}

/** 单个音质的直链结果；uid 命中 mid 的映射由调用方按 mid 取用 */
export interface SongUrlInfo {
  url?: string
  error?: string
  /** 服务端可能返回的扩展字段（文件大小、码率等） */
  [key: string]: unknown
}

export type SongUrlsData = Record<string, SongUrlInfo>

export interface LyricData {
  lyric?: string
  trans?: string
  roma?: string
}

export interface SimilarItem {
  id?: number
  mid?: string
  name?: string
  singer?: Singer[]
}

export interface SimilarData {
  list: SimilarItem[]
}

export interface LoginStatusData {
  loggedIn: boolean
  musicid?: number | string
  expired?: boolean
  file?: string
}

/** 0 DONE / 1 SCAN / 2 CONF / 3 REFUSE / 4 TIMEOUT / -1 OTHER */
export type QrEventCode = 0 | 1 | 2 | 3 | 4 | -1

export interface QrCodeData {
  identifier: string
  mime: string
  /** base64，不带 data: 前缀 */
  data: string
}

export interface QrCheckData {
  event: QrEventCode
}
