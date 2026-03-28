/**
 * Time utilities tests — parsing, period grouping, rolling average.
 */
import { describe, it, expect } from 'vitest'
import { parseTimestamp, toPeriod, sortPeriods, rollingAverage, detectGranularity } from '../../src/engine/timeUtils'

describe('parseTimestamp', () => {
  it('parses ISO date string', () => {
    const d = parseTimestamp('2024-03-15')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2024)
    expect(d!.getMonth()).toBe(2) // March = 2 (0-indexed)
    expect(d!.getDate()).toBe(15)
  })

  it('parses ISO datetime string', () => {
    const d = parseTimestamp('2024-03-15T10:30:00')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2024)
  })

  it('parses Unix seconds (10-digit integer)', () => {
    const d = parseTimestamp(1710460800) // 2024-03-15T00:00:00Z
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2024)
  })

  it('parses Unix seconds as string', () => {
    const d = parseTimestamp('1710460800')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2024)
  })

  it('parses Unix milliseconds (13-digit integer)', () => {
    const d = parseTimestamp(1710460800000)
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2024)
  })

  it('parses Excel serial date', () => {
    // 45366 = March 15, 2024 in Excel serial format
    const d = parseTimestamp(45366)
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2024)
  })

  it('parses Excel serial date as string', () => {
    const d = parseTimestamp('45366')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2024)
  })

  it('returns null for unparseable values', () => {
    expect(parseTimestamp(null)).toBeNull()
    expect(parseTimestamp('')).toBeNull()
    expect(parseTimestamp('not a date')).toBeNull()
    expect(parseTimestamp(42)).toBeNull() // too small for any format
  })
})

describe('toPeriod', () => {
  const d = new Date(2024, 2, 15) // March 15, 2024

  it('returns correct day', () => {
    expect(toPeriod(d, 'day')).toBe('2024-03-15')
  })

  it('returns correct week', () => {
    const w = toPeriod(d, 'week')
    expect(w).toMatch(/^2024-W\d{2}$/)
  })

  it('returns correct month', () => {
    expect(toPeriod(d, 'month')).toBe('2024-03')
  })

  it('returns correct quarter', () => {
    expect(toPeriod(d, 'quarter')).toBe('2024-Q1')
    expect(toPeriod(new Date(2024, 5, 1), 'quarter')).toBe('2024-Q2')
    expect(toPeriod(new Date(2024, 9, 1), 'quarter')).toBe('2024-Q4')
  })

  it('returns correct year', () => {
    expect(toPeriod(d, 'year')).toBe('2024')
  })
})

describe('sortPeriods', () => {
  it('sorts chronologically', () => {
    const periods = ['2025-Q1', '2024-Q4', '2024-Q2', '2024-Q3']
    const sorted = sortPeriods(periods)
    expect(sorted).toEqual(['2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1'])
  })

  it('sorts months correctly', () => {
    const periods = ['2024-12', '2024-02', '2024-11', '2024-01']
    const sorted = sortPeriods(periods)
    expect(sorted).toEqual(['2024-01', '2024-02', '2024-11', '2024-12'])
  })
})

describe('rollingAverage', () => {
  it('computes 3-period rolling average correctly', () => {
    const values = [10, 20, 30, 40, 50]
    const timestamps = values.map((_, i) => new Date(2024, 0, i + 1))
    const result = rollingAverage(values, timestamps, 3)

    expect(result).toHaveLength(5)
    expect(result[0].avg).toBe(10)       // window: [10]
    expect(result[1].avg).toBe(15)       // window: [10, 20]
    expect(result[2].avg).toBe(20)       // window: [10, 20, 30]
    expect(result[3].avg).toBe(30)       // window: [20, 30, 40]
    expect(result[4].avg).toBe(40)       // window: [30, 40, 50]
  })
})

describe('detectGranularity', () => {
  it('returns month for a 6-month dataset', () => {
    const timestamps = Array.from({ length: 180 }, (_, i) =>
      `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`
    )
    expect(detectGranularity(timestamps)).toBe('month')
  })

  it('returns week for a 30-day dataset', () => {
    const timestamps = Array.from({ length: 30 }, (_, i) =>
      `2024-03-${String(i + 1).padStart(2, '0')}`
    )
    expect(detectGranularity(timestamps)).toBe('week')
  })

  it('returns day for a 10-day dataset', () => {
    const timestamps = Array.from({ length: 10 }, (_, i) =>
      `2024-03-${String(i + 1).padStart(2, '0')}`
    )
    expect(detectGranularity(timestamps)).toBe('day')
  })

  it('returns month for all-same-day timestamps', () => {
    // Edge case: all timestamps are the same day → range = 0 → 'day'
    const timestamps = Array.from({ length: 50 }, () => '2024-03-15')
    expect(detectGranularity(timestamps)).toBe('day')
  })
})
