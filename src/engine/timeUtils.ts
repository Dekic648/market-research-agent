/**
 * Time parsing and grouping utilities for temporal analysis.
 * Pure functions — no side effects, no store imports.
 */

export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

// Excel epoch: December 30, 1899
const EXCEL_EPOCH = new Date(1899, 11, 30).getTime()

/**
 * Parse any supported timestamp format to a JS Date.
 * Returns null for unparseable values.
 */
export function parseTimestamp(value: number | string | null): Date | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    // Unix seconds (10-digit range)
    if (value >= 1e9 && value < 1e10) return new Date(value * 1000)
    // Unix milliseconds (13-digit range)
    if (value >= 1e12 && value < 1e14) return new Date(value)
    // Excel serial date (5-digit range 35000–55000)
    if (value >= 35000 && value <= 55000) return new Date(EXCEL_EPOCH + value * 86400000)
    return null
  }

  const str = String(value).trim()
  if (!str) return null

  // Unix seconds as string
  if (/^\d{10}$/.test(str)) return new Date(parseInt(str, 10) * 1000)
  // Unix milliseconds as string
  if (/^\d{13}$/.test(str)) return new Date(parseInt(str, 10))
  // Excel serial date as string
  if (/^\d{5}$/.test(str)) {
    const n = parseInt(str, 10)
    if (n >= 35000 && n <= 55000) return new Date(EXCEL_EPOCH + n * 86400000)
    return null
  }

  // ISO and standard date strings
  const d = new Date(str)
  if (!isNaN(d.getTime())) return d

  // Try DD/MM/YYYY (swap day/month if standard parse failed)
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (dmyMatch) {
    const [, a, b, y] = dmyMatch
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10)
    // Try MM/DD/YYYY first
    const mmdd = new Date(year, parseInt(a, 10) - 1, parseInt(b, 10))
    if (!isNaN(mmdd.getTime()) && mmdd.getDate() === parseInt(b, 10)) return mmdd
    // Try DD/MM/YYYY
    const ddmm = new Date(year, parseInt(b, 10) - 1, parseInt(a, 10))
    if (!isNaN(ddmm.getTime()) && ddmm.getDate() === parseInt(a, 10)) return ddmm
  }

  return null
}

/**
 * Group a Date into a period string.
 */
export function toPeriod(date: Date, granularity: Granularity): string {
  const y = date.getFullYear()
  const m = date.getMonth() // 0-indexed

  switch (granularity) {
    case 'day':
      return `${y}-${pad(m + 1)}-${pad(date.getDate())}`
    case 'week': {
      // ISO week number
      const jan1 = new Date(y, 0, 1)
      const dayOfYear = Math.floor((date.getTime() - jan1.getTime()) / 86400000) + 1
      const week = Math.ceil(dayOfYear / 7)
      return `${y}-W${pad(week)}`
    }
    case 'month':
      return `${y}-${pad(m + 1)}`
    case 'quarter': {
      const q = Math.floor(m / 3) + 1
      return `${y}-Q${q}`
    }
    case 'year':
      return `${y}`
    default:
      return `${y}-${pad(m + 1)}`
  }
}

/**
 * Sort period strings chronologically.
 */
export function sortPeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => {
    // All our period formats sort correctly lexicographically
    // because they use YYYY prefix and zero-padded months/weeks
    return a.localeCompare(b)
  })
}

/**
 * Compute rolling average over sorted (timestamp, value) pairs.
 */
export function rollingAverage(
  values: number[],
  timestamps: Date[],
  windowSize: number
): { timestamp: Date; avg: number; n: number }[] {
  if (values.length === 0 || windowSize <= 0) return []

  // Pair and sort by timestamp
  const paired = values.map((v, i) => ({ v, t: timestamps[i] }))
    .sort((a, b) => a.t.getTime() - b.t.getTime())

  const result: { timestamp: Date; avg: number; n: number }[] = []

  for (let i = 0; i < paired.length; i++) {
    const start = Math.max(0, i - windowSize + 1)
    const window = paired.slice(start, i + 1)
    const sum = window.reduce((s, p) => s + p.v, 0)
    result.push({
      timestamp: paired[i].t,
      avg: sum / window.length,
      n: window.length,
    })
  }

  return result
}

/**
 * Auto-detect appropriate granularity based on date range.
 */
export function detectGranularity(timestamps: (number | string | null)[]): Granularity {
  const dates: Date[] = []
  for (const t of timestamps) {
    const d = parseTimestamp(t)
    if (d) dates.push(d)
  }

  if (dates.length < 2) return 'month'

  const sorted = dates.sort((a, b) => a.getTime() - b.getTime())
  const rangeMs = sorted[sorted.length - 1].getTime() - sorted[0].getTime()
  const rangeDays = rangeMs / 86400000

  if (rangeDays < 14) return 'day'
  if (rangeDays < 90) return 'week'
  if (rangeDays < 730) return 'month'
  if (rangeDays < 1095) return 'quarter'
  return 'year'
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}
