import { request, requestBinary } from './http'
import type { DownloadProgress } from './http'
import type {
  LyricData,
  ShareResolveData,
  SimilarData,
  SongDetailData,
  SongUrlsData,
} from './contracts'

/** GET /song/detail?mids= —— 详情失败不阻断直链/歌词/相似 */
export function getSongDetail(mid: string, signal?: AbortSignal): Promise<SongDetailData> {
  return request<SongDetailData>(`/song/detail?mids=${encodeURIComponent(mid)}`, { signal })
}

/** GET /song/urls?mids=&type= —— 返回以 songmid 为键的直链映射 */
export function getSongUrl(
  mid: string,
  type: string,
  signal?: AbortSignal,
): Promise<SongUrlsData> {
  return request<SongUrlsData>(
    `/song/urls?mids=${encodeURIComponent(mid)}&type=${encodeURIComponent(type)}`,
    { signal },
  )
}

/** GET /song/lyric?mid=&decode=&format=text —— 失败不阻断其他面板 */
export function getSongLyric(
  mid: string,
  decode = true,
  signal?: AbortSignal,
): Promise<LyricData> {
  // format=text：让后端把 QRC XML 转成纯 LRC，前端直接展示
  return request<LyricData>(
    `/song/lyric?mid=${encodeURIComponent(mid)}&decode=${decode ? '1' : '0'}&format=text`,
    { signal },
  )
}

/** GET /song/resolve?url= —— 后端跟随 QQ 音乐短链跳转后返回 songmid */
export function resolveShareLink(url: string, signal?: AbortSignal): Promise<ShareResolveData> {
  return request<ShareResolveData>(`/song/resolve?url=${encodeURIComponent(url)}`, {
    signal,
    // 后端每跳 8s 超时、最多 4 跳，前端整体给 15s
    timeoutMs: 15_000,
  })
}

/** GET /song/similar?songid= —— 需要数字歌曲 id */
export function getSongSimilar(
  songid: string | number,
  signal?: AbortSignal,
): Promise<SimilarData> {
  return request<SimilarData>(`/song/similar?songid=${encodeURIComponent(String(songid))}`, {
    signal,
  })
}

/** 下载走服务端代理（按元数据命名 + 内嵌封面/歌词）；此函数只负责拼地址 */
export function downloadUrl(mid: string, type: string): string {
  return `/song/download?mid=${encodeURIComponent(mid)}&type=${encodeURIComponent(type)}`
}

export interface DownloadSongOptions {
  mid: string
  /** 音质档位 code（如 F000），必须显式传：后端缺省档不是无损 */
  code: string
  signal?: AbortSignal
  onProgress?: (progress: DownloadProgress) => void
}

/**
 * 取回文件并触发浏览器保存。返回实际落盘文件名（来自后端 Content-Disposition）。
 * 走 requestBinary，所以上游凭证失效时和其他接口一样会触发全局会话失效提示。
 */
export async function downloadSong(options: DownloadSongOptions): Promise<string> {
  const { mid, code, signal, onProgress } = options
  const { blob, filename } = await requestBinary(downloadUrl(mid, code), { signal, onProgress })

  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 交给浏览器开始取流后再释放，避免偶发空文件
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)

  return filename
}
