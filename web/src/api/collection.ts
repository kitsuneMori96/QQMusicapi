import { request } from './http'
import type { AlbumDetailData, SonglistDetailData } from './contracts'

/** 合集详情：专辑与歌单各一条路由，曲目形状一致 */
export type CollectionKind = 'album' | 'songlist'

/** GET /album/detail —— 专辑头部 + 曲目分页 */
export function albumDetail(
  mid: string,
  page = 1,
  num = 50,
  signal?: AbortSignal,
): Promise<AlbumDetailData> {
  const path = `/album/detail?mid=${encodeURIComponent(mid)}&page=${page}&num=${num}`
  return request<AlbumDetailData>(path, { signal })
}

/** GET /songlist/detail —— 歌单头部 + 曲目分页 */
export function songlistDetail(
  dissid: string,
  page = 1,
  num = 30,
  signal?: AbortSignal,
): Promise<SonglistDetailData> {
  const path = `/songlist/detail?dissid=${encodeURIComponent(dissid)}&page=${page}&num=${num}`
  return request<SonglistDetailData>(path, { signal })
}
