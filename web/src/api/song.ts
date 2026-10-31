import { ApiError, request } from './http'
import type {
  LyricData,
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

/**
 * 解析 Content-Disposition 里的文件名。
 * RFC 5987 的 filename*=UTF-8'' 优先于旧式 filename=。
 */
export function parseContentDispositionFilename(disposition: string | null): string {
  if (!disposition) return ''

  const encoded = disposition.match(/filename\*\s*=\s*([^;]+)/i)?.[1]
  if (encoded) {
    const raw = encoded.trim().replace(/^UTF-8''/i, '').replace(/^"|"$/g, '')
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }

  const plain = disposition.match(/filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i)
  return (plain?.[1] ?? plain?.[2] ?? '').trim()
}

/**
 * fetch 下载：错误时解析信封 message 抛 ApiError，成功时用 blob + 临时 <a> 触发保存。
 * 返回实际文件名，供 UI 提示。
 */
export async function downloadSong(
  mid: string,
  code: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(downloadUrl(mid, code), { signal })

  if (!response.ok) {
    let message = ''
    try {
      const text = await response.text()
      const envelope = JSON.parse(text) as { message?: string }
      message = envelope.message ?? ''
    } catch {
      // 非 JSON 错误体：退回状态码提示
    }
    throw new ApiError(message || `下载失败 (HTTP ${response.status})`, -1, response.status)
  }

  const blob = await response.blob()
  const filename =
    parseContentDispositionFilename(response.headers.get('content-disposition')) ||
    `${mid}-${code}`

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
