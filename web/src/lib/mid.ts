/**
 * 从分享链接 / songDetail URL / 纯 mid 中提取 songmid。
 * 规则与旧原生页保持一致（兼容历史链接形态）。
 */
export function extractMid(input: string): string {
  const s = String(input ?? '').trim()
  if (!s) return ''

  // 1) songDetail/{mid}
  const detail = s.match(/songDetail\/([A-Za-z0-9]+)/)
  if (detail?.[1]) return detail[1]

  // 2) songmid={mid}（分享链接常见）
  const query = s.match(/[?&]songmid=([A-Za-z0-9]+)/)
  if (query?.[1]) return query[1]

  // 3) /song/{mid}
  const path = s.match(/\/song\/([A-Za-z0-9]+)/)
  if (path?.[1]) return path[1]

  // 4) 纯 mid：10–20 位字母数字
  if (/^[A-Za-z0-9]{10,20}$/.test(s)) return s

  return ''
}

const QQ_HOST_RE = /(^|\.)y\.qq\.com$/i
// 分享文案常以中文标点/表情结尾，URL 正则会把它们带进来
const TRAILING_PUNCT_RE = /[)\]}>.,;!?，。；！？、）】」』]+$/

/**
 * 从整段分享文案中提取 QQ 音乐链接（短链 / playsong / songDetail）。
 * extractMid 取不到 mid 时用它走后端跳转解析；只放行 y.qq.com 域。
 */
export function extractShareUrl(input: string): string {
  const match = String(input ?? '').match(/https?:\/\/[^\s"'<>，。；！？、（）【】「」『』]+/i)
  if (!match?.[0]) return ''

  try {
    const url = new URL(match[0].replace(TRAILING_PUNCT_RE, ''))
    if (!QQ_HOST_RE.test(url.hostname)) return ''
    return url.toString()
  } catch {
    return ''
  }
}

/** 封面地址：后端只返回 album.mid，封面图由前端按规则拼接 */
export function coverUrl(albumMid: string | undefined, size = 300): string {
  if (!albumMid) return ''
  return `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${albumMid}.jpg`
}

/** 秒 → 0:00 / 0:00:00 */
export function formatDuration(seconds: number | undefined): string {
  if (!Number.isFinite(seconds) || (seconds ?? 0) < 0) return '--:--'
  const total = Math.floor(seconds as number)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
