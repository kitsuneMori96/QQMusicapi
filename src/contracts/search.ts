/**
 * 搜索域契约.
 *
 * 响应结构直接来自 QQ 上游且层级较深, 暂以 UnknownRecord 表述,
 * 等前端真正消费搜索结果时再按需细化.
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
