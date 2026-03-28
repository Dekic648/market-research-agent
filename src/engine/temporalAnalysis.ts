/**
 * Temporal analysis functions — trend, period grouping, granularity detection.
 * Pure functions. Used by temporal plugins.
 */

import { parseTimestamp, toPeriod, sortPeriods, detectGranularity, type Granularity } from './timeUtils'

// ============================================================
// Types
// ============================================================

export interface TrendResult {
  periods: string[]
  means: number[]
  ns: number[]
  rollingAvg3: number[]
  overallTrend: 'increasing' | 'decreasing' | 'flat'
  trendStrength: number   // R² of linear fit
}

export interface GroupByPeriodResult {
  periods: string[]
  rowIndices: number[][]
  counts: number[]
}

// ============================================================
// trendOverTime
// ============================================================

export function trendOverTime(
  values: (number | null)[],
  timestamps: (number | string | null)[],
  granularity: Granularity
): TrendResult {
  // Parse timestamps and pair with values
  const paired: { period: string; value: number; date: Date }[] = []

  for (let i = 0; i < values.length; i++) {
    if (values[i] === null || timestamps[i] === null) continue
    const d = parseTimestamp(timestamps[i])
    if (!d) continue
    const v = typeof values[i] === 'number' ? values[i] as number : parseFloat(String(values[i]))
    if (isNaN(v)) continue
    paired.push({ period: toPeriod(d, granularity), value: v, date: d })
  }

  // Group by period
  const periodMap = new Map<string, number[]>()
  for (const p of paired) {
    if (!periodMap.has(p.period)) periodMap.set(p.period, [])
    periodMap.get(p.period)!.push(p.value)
  }

  const periods = sortPeriods(Array.from(periodMap.keys()))
  const means = periods.map((p) => {
    const vals = periodMap.get(p)!
    return vals.reduce((s, v) => s + v, 0) / vals.length
  })
  const ns = periods.map((p) => periodMap.get(p)!.length)

  // 3-period rolling average of means
  const rollingAvg3 = means.map((_, i) => {
    const start = Math.max(0, i - 2)
    const window = means.slice(start, i + 1)
    return window.reduce((s, v) => s + v, 0) / window.length
  })

  // Linear regression on period index vs mean to determine trend
  const { slope, r2 } = linearFitSimple(means)
  const overallTrend: TrendResult['overallTrend'] =
    r2 > 0.1 ? (slope > 0 ? 'increasing' : 'decreasing') : 'flat'

  return { periods, means, ns, rollingAvg3, overallTrend, trendStrength: r2 }
}

// ============================================================
// groupByPeriod
// ============================================================

export function groupByPeriod(
  timestamps: (number | string | null)[],
  granularity: Granularity
): GroupByPeriodResult {
  const periodMap = new Map<string, number[]>()

  for (let i = 0; i < timestamps.length; i++) {
    const d = parseTimestamp(timestamps[i])
    if (!d) continue
    const period = toPeriod(d, granularity)
    if (!periodMap.has(period)) periodMap.set(period, [])
    periodMap.get(period)!.push(i)
  }

  const periods = sortPeriods(Array.from(periodMap.keys()))
  const rowIndices = periods.map((p) => periodMap.get(p)!)
  const counts = rowIndices.map((r) => r.length)

  return { periods, rowIndices, counts }
}

// ============================================================
// Simple linear fit (x = index, y = values)
// ============================================================

function linearFitSimple(ys: number[]): { slope: number; r2: number } {
  const n = ys.length
  if (n < 2) return { slope: 0, r2: 0 }

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += ys[i]
    sumXY += i * ys[i]
    sumXX += i * i
    sumYY += ys[i] * ys[i]
  }

  const denomX = n * sumXX - sumX * sumX
  if (denomX === 0) return { slope: 0, r2: 0 }

  const slope = (n * sumXY - sumX * sumY) / denomX
  const meanY = sumY / n
  const ssTot = sumYY - n * meanY * meanY
  const intercept = (sumY - slope * sumX) / n
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * i
    ssRes += (ys[i] - pred) * (ys[i] - pred)
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

  return { slope, r2: Math.max(0, r2) }
}

export { detectGranularity }
