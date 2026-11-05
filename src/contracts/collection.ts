/**
 * 合集 (专辑 / 歌单) 详情契约.
 *
 * 两者的曲目都归一成搜歌结果的形状 (SongSearchItem)，前端用同一套列渲染；
 * 头部各留各的身份与来源字段。
 */

import type { SongSearchItem } from "./search.ts";

/** 合集里的一首歌：与搜索结果同形，只是不携带所属专辑 mid 的展示需求 */
export type CollectionTrack = SongSearchItem;

/** GET /album/detail?mid=<albummid> */
export interface AlbumDetailData {
  mid: string;
  name: string;
  singer: string;
  publishDate: string;
  desc: string;
  total: number;
  page: number;
  num: number;
  hasMore: boolean;
  items: CollectionTrack[];
}

/** GET /songlist/detail?dissid=<dissid> */
export interface SonglistDetailData {
  id: string;
  name: string;
  creator: string;
  cover: string;
  desc: string;
  total: number;
  page: number;
  num: number;
  hasMore: boolean;
  items: CollectionTrack[];
}
