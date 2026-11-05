/**
 * 搜索域契约.
 *
 * 原始上游响应（general / byType / quick）层级深且字段近百，仍按 UnknownRecord 表述；
 * 前端真正消费的只有归一化后的 /search/song，那份细化在下面。
 */

import type { UnknownRecord } from "./common.ts";

export const SearchType = {
  SONG: 0,
  SINGER: 1,
  ALBUM: 2,
  SONGLIST: 3,
  MV: 4,
  LYRIC: 7,
  USER: 8,
  AUDIO_ALBUM: 15,
  AUDIO: 18,
} as const;

export type SearchTypeValue = (typeof SearchType)[keyof typeof SearchType];

export type SearchHotkeyData = UnknownRecord;
export type SearchCompleteData = UnknownRecord;
export type SearchQuickData = UnknownRecord;
export type SearchGeneralData = UnknownRecord;
export type SearchByTypeData = UnknownRecord;

/** GET /search/song —— 归一化后的一条搜索结果（只留认歌需要的字段） */
export interface SongSearchItem {
  mid: string;
  id: number;
  name: string;
  singer: string;
  album: string;
  albumMid: string;
  interval: number;
}

/** GET /search/song —— 分页信息来自上游 meta.sum / meta.curpage，不在 body 里 */
export interface SongSearchData {
  keyword: string;
  page: number;
  num: number;
  total: number;
  items: SongSearchItem[];
}

export interface SearchGeneralBody {
  keyword: string;
  page?: number;
  num?: number;
  searchid?: string | null;
  pageStart?: number | null;
  highlight?: boolean;
}

export interface SearchByTypeBody {
  keyword: string;
  type?: SearchTypeValue;
  num?: number;
  page?: number;
  searchid?: string | null;
  highlight?: boolean;
}
