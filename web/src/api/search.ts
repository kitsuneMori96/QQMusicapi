import { request } from './http'
import type { SongSearchData } from './contracts'

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
  const path = `/search/song?keyword=${encodeURIComponent(keyword)}&page=${page}&num=${num}`
  return request<SongSearchData>(path, { signal })
}
