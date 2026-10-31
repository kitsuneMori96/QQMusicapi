export interface LrcLine {
  time: number
  text: string
}

const STAMP_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/**
 * 解析纯 LRC：支持一行多时间戳、[mm:ss] / [mm:ss.xx] / [mm:ss.xxx]。
 * [ti:]/[ar:] 等元信息与无时间戳行会被忽略；纯文本歌词返回空数组。
 */
export function parseLrc(input: string | undefined | null): LrcLine[] {
  if (!input) return []

  const lines: LrcLine[] = []
  for (const raw of input.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(STAMP_RE)]
    if (stamps.length === 0) continue

    const text = raw.replace(STAMP_RE, '').trim()
    for (const stamp of stamps) {
      const minutes = Number(stamp[1])
      const seconds = Number(stamp[2])
      const fractionRaw = stamp[3] ?? '0'
      const fraction = Number(fractionRaw) / 10 ** fractionRaw.length
      lines.push({ time: minutes * 60 + seconds + fraction, text })
    }
  }

  return lines.sort((a, b) => a.time - b.time)
}

/** 返回 time 时刻应高亮的行；尚未开始时为 -1。 */
export function findActiveIndex(lines: LrcLine[], time: number | undefined): number {
  if (!Array.isArray(lines) || lines.length === 0) return -1
  const target = Number.isFinite(time) ? (time as number) + 0.05 : -1
  const first = lines[0]
  if (!first || target < first.time) return -1

  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const line = lines[mid]
    if (!line) break
    if (line.time <= target) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}
