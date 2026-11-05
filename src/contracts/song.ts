/**
 * 歌曲域契约.
 *
 * 说明: QQ 上游字段极多且会变, 这里只建模前端实际读取的字段,
 * 其余通过索引签名保留, 不在契约层做强校验.
 */

import type { UnknownRecord } from "./common.ts";

export interface SingerRef extends UnknownRecord {
  mid?: string;
  name?: string;
}

export interface AlbumRef extends UnknownRecord {
  mid?: string;
  name?: string;
}

export interface SongTrack extends UnknownRecord {
  id?: number | string;
  mid?: string;
  name?: string;
  singer?: SingerRef[];
  album?: AlbumRef;
  /** 时长(秒) */
  interval?: number;
  /** 专辑图 pmid(歌声/单曲图) */
  pmid?: string;
  time_public?: string;
  public_time?: string;
  genre?: string | number;
}

/** GET /song/detail?mids= */
export interface SongDetailData extends UnknownRecord {
  tracks?: SongTrack[];
}

/** 单档音质的播放信息; url 缺失时 error 说明原因 */
export interface PlayUrlInfo extends UnknownRecord {
  url?: string;
  error?: string;
  size?: number;
}

/** GET /song/urls?mids=&type= —— 以 songmid 为键 */
export type SongUrlsData = Record<string, PlayUrlInfo>;

/**
 * GET /song/lyric?mid=&decode=&kind=&format=text —— 歌词三轨。
 * 同一端点带 `download=1` 时不是本结构，而是 `kind` 那一轨的 .lrc 文件正文。
 */
export interface LyricData {
  /** 解密前的原始响应 */
  raw?: unknown;
  lyric?: string;
  trans?: string;
  roma?: string;
  /** QRC 解密失败时的提示, 其余字段可能缺失 */
  decodeError?: string;
}

/** GET /song/similar?songid= */
export interface SimilarData {
  list: SongTrack[];
  groups: unknown[];
}

/** GET /song/relatedSonglist?mid= —— 直接透传上游结构 */
export type RelatedSonglistData = UnknownRecord;

/** GET /song/resolve?url= —— 分享链接解析结果 (至少含 songmid) */
export interface ShareResolveData extends UnknownRecord {
  mid: string;
  id?: number | string;
  name?: string;
  singer?: string;
}
