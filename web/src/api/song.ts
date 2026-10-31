import { request } from './http'
import type {
  LyricData,
  SimilarData,
  SongDetailData,
  SongUrlsData,
} from './contracts'

/** GET /song/detail?mids= —— 详情失败不阻断直链/歌词/相似 */
export function getSongDetail(mid: string): Promise<SongDetailData> {
  return request<SongDetailData>(`/song/detail?mids=${encodeURIComponent(mid)}`)
}

/** GET /song/urls?mids=&type= —— 返回以 songmid 为键的直链映射 */
export function getSongUrl(mid: string, type: string): Promise<SongUrlsData> {
  return request<SongUrlsData>(
    `/song/urls?mids=${encodeURIComponent(mid)}&type=${encodeURIComponent(type)}`,
  )
}

/** GET /song/lyric?mid=&decode= —— 失败不阻断其他面板 */
export function getSongLyric(mid: string, decode = true): Promise<LyricData> {
  return request<LyricData>(
    `/song/lyric?mid=${encodeURIComponent(mid)}&decode=${decode ? '1' : '0'}`,
  )
}

/** GET /song/similar?songid= —— 需要数字歌曲 id */
export function getSongSimilar(songid: string | number): Promise<SimilarData> {
  return request<SimilarData>(`/song/similar?songid=${encodeURIComponent(String(songid))}`)
}

/** 下载走服务端代理（按元数据命名 + 内嵌封面/歌词），浏览器直接跳转即可 */
export function downloadUrl(mid: string, type: string): string {
  return `/song/download?mid=${encodeURIComponent(mid)}&type=${encodeURIComponent(type)}`
}
