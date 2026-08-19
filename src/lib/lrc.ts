// ============================================================
// LRC 歌词解析
// 支持 [mm:ss.xx] 时间标签（同一行多标签）、[offset] 偏移、元数据标签
// ============================================================

export interface LrcLine {
  /** 歌词出现的秒数 */
  time: number
  text: string
}

const TIME_TAG = /\[(\d+):(\d+(?:\.\d+)?)\]/g

export function parseLrc(raw: string): LrcLine[] {
  const lines: LrcLine[] = []
  let offsetMs = 0

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // [offset:+500] 全局偏移（毫秒；正值表示歌词提前）
    const offsetMatch = trimmed.match(/^\[offset:\s*(-?\d+)\s*\]/i)
    if (offsetMatch) {
      offsetMs = parseInt(offsetMatch[1], 10)
      continue
    }
    // 其它元数据标签（[ti:] [ar:] [al:] 等）直接跳过
    if (!/\[\d+:\d+/.test(trimmed)) continue

    const text = trimmed.replace(TIME_TAG, '').trim()
    // 同一时间标签可能有多个（同一句歌词出现在多处）
    for (const m of trimmed.matchAll(TIME_TAG)) {
      const time = parseInt(m[1], 10) * 60 + parseFloat(m[2]) - offsetMs / 1000
      lines.push({ time: Math.max(0, time), text: text || '♪' })
    }
  }

  return lines.sort((a, b) => a.time - b.time)
}

/** 二分查找：当前时间 active 的是第几行（最后一行 time <= t），没有返回 -1 */
export function activeLineIndex(lines: LrcLine[], t: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= t) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/** 秒 → mm:ss */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
