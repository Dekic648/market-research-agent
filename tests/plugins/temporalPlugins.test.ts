/**
 * Temporal plugin tests — TrendPlugin, PeriodGroupPlugin, TimeSegmentPlugin.
 */
import { describe, it, expect } from 'vitest'
import type { ResolvedColumnData } from '../../src/plugins/types'

import { TrendPlugin } from '../../src/plugins/TrendPlugin'
import { PeriodGroupPlugin } from '../../src/plugins/PeriodGroupPlugin'
import { TimeSegmentPlugin } from '../../src/plugins/TimeSegmentPlugin'

// Generate test data: 6 months of timestamps with paired numeric values
function makeTemporalData(nPerMonth: number, trendSlope: number = 0): {
  timestamps: string[]
  values: number[]
} {
  const timestamps: string[] = []
  const values: number[] = []
  for (let m = 1; m <= 6; m++) {
    for (let d = 0; d < nPerMonth; d++) {
      const day = (d % 28) + 1
      timestamps.push(`2024-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
      values.push(3 + trendSlope * (m - 1) + ((d % 3) - 1) * 0.2)
    }
  }
  return { timestamps, values }
}

describe('TrendPlugin', () => {
  it('runs successfully on timestamp + numeric column pair', async () => {
    const { timestamps, values } = makeTemporalData(20, 0.5)
    const data: ResolvedColumnData = {
      columns: [
        { id: 'ts', name: 'Survey Date', values: timestamps },
        { id: 'q1', name: 'Satisfaction', values },
      ],
      n: timestamps.length,
    }

    const result = await TrendPlugin.run(data)
    expect(result.pluginId).toBe('trend_over_time')
    expect(result.charts.length).toBeGreaterThan(0)
    expect(result.findings.length).toBe(1)
    expect(result.findings[0].type).toBe('trend')
  })

  it('plainLanguage contains column name and no raw stat notation', async () => {
    const { timestamps, values } = makeTemporalData(20, 0.5)
    const data: ResolvedColumnData = {
      columns: [
        { id: 'ts', name: 'Survey Date', values: timestamps },
        { id: 'q1', name: 'Customer Satisfaction', values },
      ],
      n: timestamps.length,
    }

    const result = await TrendPlugin.run(data)
    const text = result.plainLanguage
    expect(text).toContain('Customer Satisfaction')
    expect(text).not.toMatch(/H\(\d+\)/)
    expect(text).not.toMatch(/χ²/)
    expect(text.length).toBeGreaterThan(20)
    expect(text.length).toBeLessThan(300)
  })
})

describe('PeriodGroupPlugin', () => {
  it('runs on a timestamp column alone', async () => {
    const { timestamps } = makeTemporalData(15)
    const data: ResolvedColumnData = {
      columns: [{ id: 'ts', name: 'Created At', values: timestamps }],
      n: timestamps.length,
    }

    const result = await PeriodGroupPlugin.run(data)
    expect(result.pluginId).toBe('period_frequency')
    expect(result.findings.length).toBe(1)
    expect(result.findings[0].type).toBe('period_frequency')
  })

  it('plainLanguage contains no raw stat notation', async () => {
    const { timestamps } = makeTemporalData(15)
    const data: ResolvedColumnData = {
      columns: [{ id: 'ts', name: 'Collected', values: timestamps }],
      n: timestamps.length,
    }

    const result = await PeriodGroupPlugin.run(data)
    const text = result.plainLanguage
    expect(text).toContain('responses')
    expect(text).not.toMatch(/H\(\d+\)/)
    expect(text.length).toBeGreaterThan(20)
  })
})

describe('TimeSegmentPlugin', () => {
  it('does not run when any period has < 5 responses', async () => {
    // Only 3 responses per month — should skip
    const { timestamps, values } = makeTemporalData(3)
    const data: ResolvedColumnData = {
      columns: [
        { id: 'ts', name: 'Date', values: timestamps },
        { id: 'q1', name: 'Score', values },
      ],
      n: timestamps.length,
    }

    const result = await TimeSegmentPlugin.run(data)
    expect(result.findings).toHaveLength(0)
    expect(result.plainLanguage).toContain('Skipped')
  })

  it('does not run when there are > 8 periods', async () => {
    // 12 months → 12 periods, exceeds limit
    const timestamps: string[] = []
    const values: number[] = []
    for (let m = 1; m <= 12; m++) {
      for (let d = 0; d < 10; d++) {
        timestamps.push(`2024-${String(m).padStart(2, '0')}-${String((d % 28) + 1).padStart(2, '0')}`)
        values.push(3 + Math.random())
      }
    }
    const data: ResolvedColumnData = {
      columns: [
        { id: 'ts', name: 'Date', values: timestamps },
        { id: 'q1', name: 'Score', values },
      ],
      n: timestamps.length,
    }

    const result = await TimeSegmentPlugin.run(data)
    // With monthly granularity, 12 periods > 8 → skip
    expect(result.plainLanguage).toContain('Skipped')
  })

  it('runs successfully with valid data (2-8 periods, ≥5 each)', async () => {
    const { timestamps, values } = makeTemporalData(10, 0.5)
    const data: ResolvedColumnData = {
      columns: [
        { id: 'ts', name: 'Survey Date', values: timestamps },
        { id: 'q1', name: 'Brand Trust', values },
      ],
      n: timestamps.length,
    }

    const result = await TimeSegmentPlugin.run(data)
    expect(result.pluginId).toBe('time_segment_comparison')
    expect(result.findings.length).toBe(1)
  })

  it('plainLanguage contains column name and no raw stat notation', async () => {
    const { timestamps, values } = makeTemporalData(10, 0.5)
    const data: ResolvedColumnData = {
      columns: [
        { id: 'ts', name: 'Date', values: timestamps },
        { id: 'q1', name: 'Employee Engagement', values },
      ],
      n: timestamps.length,
    }

    const result = await TimeSegmentPlugin.run(data)
    if (result.findings.length > 0) {
      const text = result.plainLanguage
      expect(text).toContain('Employee Engagement')
      expect(text).not.toMatch(/H\(\d+\)/)
    }
  })
})
