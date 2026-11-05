import { request } from './http'
import type {
  AlbumSearchData,
  AlbumSearchItem,
  SonglistSearchData,
  SonglistSearchItem,
  SongSearchData,
  SongSearchItem,
} from './contracts'

/** 搜索页签的三种结果类型；`?type=` 里用的就是这三个值 */
export type SearchKind = 'song' | 'album' | 'songlist'

export type SearchItem = SongSearchItem | AlbumSearchItem | SonglistSearchItem

export function isSongItem(item: SearchItem): item is SongSearchItem {
  return 'albumMid' in item
}

export function isAlbumItem(item: SearchItem): item is AlbumSearchItem {
  return 'publishDate' in item
}

export function isSonglistItem(item: SearchItem): item is SonglistSearchItem {
  return 'creator' in item
}

function searchPath(path: string, keyword: string, page: number, num: number): string {
  return `${path}?keyword=${encodeURIComponent(keyword)}&page=${page}&num=${num}`
}

/**
 * GET /search/song —— 关键词搜歌。
 * 后端已把上游原始结构归一化，这里拿到的就是能直接渲染的紧凑结果。
 */
export function searchSong(
  keyword: string,
  page = 1,
  num = 20,
  signal?: AbortSignal,
): Promise<SongSearchData> {
  return request<SongSearchData>(searchPath('/search/song', keyword, page, num), { signal })
}

/** GET /search/album —— 关键词搜专辑 */
export function searchAlbum(
  keyword: string,
  page = 1,
  num = 20,
  signal?: AbortSignal,
): Promise<AlbumSearchData> {
  return request<AlbumSearchData>(searchPath('/search/album', keyword, page, num), { signal })
}

/** GET /search/songlist —— 关键词搜歌单 */
export function searchSonglist(
  keyword: string,
  page = 1,
  num = 20,
  signal?: AbortSignal,
): Promise<SonglistSearchData> {
  return request<SonglistSearchData>(searchPath('/search/songlist', keyword, page, num), { signal })
}
