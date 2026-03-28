/**
 * Temporal analysis engine tests — trend, groupByPeriod, detectGranularity.
 */
import { describe, it, expect } from 'vitest'
import { trendOverTime, groupByPeriod, detectGranularity } from '../../src/engine/temporalAnalysis'

describe('trendOverTime', () => {
  it('returns increasing for a clearly rising series', () => {
    // 6 months of data, values increase from ~1 to ~5
    const timestamps: string[] = []
    const values: number[] = []
    for (let m = 1; m <= 6; m++) {
      for (let d = 1; d <= 20; d++) {
        timestamps.push(`2024-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
        values.push(m + Math.random() * 0.5)
      }
    }

    const result = trendOverTime(values, timestamps, 'month')
    expect(result.overallTrend).toBe('increasing')
    expect(result.trendStrength).toBeGreaterThan(0.1)
    expect(result.periods.length).toBe(6)
    expect(result.means.length).toBe(6)
    expect(result.rollingAvg3.length).toBe(6)
  })

  it('returns flat for a random series', () => {
    const timestamps: string[] = []
    const values: number[] = []
    for (let m = 1; m <= 6; m++) {
      for (let d = 1; d <= 20; d++) {
        timestamps.push(`2024-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
        values.push(3 + (((m * 7 + d * 3) % 5) - 2) * 0.3) // pseudo-random around 3
      }
    }

    const result = trendOverTime(values, timestamps, 'month')
    expect(result.overallTrend).toBe('flat')
  })

  it('handles empty data gracefully', () => {
    const result = trendOverTime([], [], 'month')
    expect(result.periods).toHaveLength(0)
    expect(result.overallTrend).toBe('flat')
  })
})

describe('groupByPeriod', () => {
  it('returns correct row indices per period', () => {
    const timestamps = [
      '2024-01-05', '2024-01-15',
      '2024-02-10', '2024-02-20',
      '2024-03-01',
    ]
    const result = groupByPeriod(timestamps, 'month')

    expect(result.periods).toEqual(['2024-01', '2024-02', '2024-03'])
    expect(result.rowIndices[0]).toEqual([0, 1])
    expect(result.rowIndices[1]).toEqual([2, 3])
    expect(result.rowIndices[2]).toEqual([4])
    expect(result.counts).toEqual([2, 2, 1])
  })

  it('handles null timestamps by skipping them', () => {
    const timestamps: (string | null)[] = ['2024-01-01', null, '2024-01-15', null]
    const result = groupByPeriod(timestamps, 'month')
    expect(result.periods).toEqual(['2024-01'])
    expect(result.rowIndices[0]).toEqual([0, 2])
    expect(result.counts).toEqual([2])
  })
})

describe('detectGranularity (engine level)', () => {
  it('returns month for a 6-month dataset', () => {
    const ts = ['2024-01-01', '2024-06-30']
    expect(detectGranularity(ts)).toBe('month')
  })

  it('returns week for a 30-day dataset', () => {
    const ts = ['2024-03-01', '2024-03-30']
    expect(detectGranularity(ts)).toBe('week')
  })

  it('returns quarter for a 2-year dataset', () => {
    const ts = ['2023-01-01', '2024-12-31']
    expect(detectGranularity(ts)).toBe('quarter')
  })

  it('returns year for a 5-year dataset', () => {
    const ts = ['2019-01-01', '2024-12-31']
    expect(detectGranularity(ts)).toBe('year')
  })
})
