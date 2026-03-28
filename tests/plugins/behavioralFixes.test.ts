/**
 * Tests for behavioral analysis fixes:
 *   - DescriptivesPlugin
 *   - CorrelationPlugin Spearman auto-switch
 *   - SegmentProfilePlugin median + payer rate
 *   - RegressionPlugin log-transform for spend outcomes
 */

import { describe, it, expect } from 'vitest'
import type { ResolvedColumnData } from '../../src/plugins/types'

// Register plugins
import '../../src/plugins/DescriptivesPlugin'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/SegmentProfilePlugin'
import '../../src/plugins/RegressionPlugin'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'

// ============================================================
// Helpers
// ============================================================

function makeColumn(name: string, values: (number | string | null)[]) {
  return { id: `col_${name}`, name, values, nullMeaning: 'missing' as const }
}

/** Generate right-skewed data (simulates revenue with zeros) */
function makeSkewedRevenue(n: number): number[] {
  const vals: number[] = []
  for (let i = 0; i < n; i++) {
    if (i < n * 0.7) vals.push(0)             // 70% zeros
    else if (i < n * 0.9) vals.push(50)       // 20% moderate
    else vals.push(500 + (i - n * 0.9) * 200) // 10% whale spend
  }
  return vals
}

/** Generate normally distributed-ish data */
function makeNormal(n: number, mean: number = 50, sd: number = 10): number[] {
  // Simple box-muller without randomness — deterministic spread
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * 2 - 1 // -1 to 1
    return mean + sd * t
  })
}

// ============================================================
// DescriptivesPlugin
// ============================================================

describe('DescriptivesPlugin', () => {
  const plugin = AnalysisRegistry.get('descriptives')!

  it('exists and is registered', () => {
    expect(plugin).toBeDefined()
    expect(plugin.id).toBe('descriptives')
  })

  it('detects skewed distribution', async () => {
    const data: ResolvedColumnData = {
      columns: [makeColumn('revenue', makeSkewedRevenue(100))],
      n: 100,
    }
    const result = await plugin.run(data)
    const stats = (result.data as any).result.stats[0]
    expect(stats.isSkewed).toBe(true)
    expect(stats.isZeroInflated).toBe(true)
    expect(stats.zeroRate).toBeGreaterThan(0.5)
    // Plain language should mention zeros
    expect(result.findings[0].summary).toContain('zero')
  })

  it('detects zero-inflated distribution and reports rate', async () => {
    const vals = Array.from({ length: 50 }, (_, i) => i < 20 ? 0 : i * 2)
    const data: ResolvedColumnData = {
      columns: [makeColumn('games', vals)],
      n: 50,
    }
    const result = await plugin.run(data)
    const stats = (result.data as any).result.stats[0]
    expect(stats.isZeroInflated).toBe(true)
    expect(stats.zeroRate).toBeCloseTo(0.4, 1)
  })

  it('handles normal-ish data without skew warnings', async () => {
    const data: ResolvedColumnData = {
      columns: [makeColumn('score', makeNormal(100))],
      n: 100,
    }
    const result = await plugin.run(data)
    const stats = (result.data as any).result.stats[0]
    expect(stats.isSkewed).toBe(false)
    expect(stats.isZeroInflated).toBe(false)
    // Plain language should lead with mean
    expect(result.findings[0].summary).toContain('Mean')
  })

  it('produces histogram and box plot charts', async () => {
    const data: ResolvedColumnData = {
      columns: [makeColumn('metric', makeNormal(50))],
      n: 50,
    }
    const result = await plugin.run(data)
    expect(result.charts.length).toBe(2)
    expect(result.charts[0].type).toBe('histogram')
    expect(result.charts[1].type).toBe('boxPlot')
  })
})

// ============================================================
// CorrelationPlugin — Spearman auto-switch
// ============================================================

describe('CorrelationPlugin — Spearman auto-switch', () => {
  const plugin = AnalysisRegistry.get('correlation')!

  it('uses Pearson for normal columns', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeColumn('A', makeNormal(50)),
        makeColumn('B', makeNormal(50, 60)),
      ],
      n: 50,
    }
    const result = await plugin.run(data)
    const corr = (result.data as any).result
    expect(corr.correlationMethod).toBe('pearson')
  })

  it('auto-switches to Spearman when one column has skewness > 2', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeColumn('revenue', makeSkewedRevenue(50)),
        makeColumn('score', makeNormal(50)),
      ],
      n: 50,
    }
    const result = await plugin.run(data)
    const corr = (result.data as any).result
    expect(corr.correlationMethod).toBe('spearman')
  })

  it('notes Spearman in plain language', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeColumn('revenue', makeSkewedRevenue(50)),
        makeColumn('score', makeNormal(50)),
      ],
      n: 50,
    }
    const result = await plugin.run(data)
    expect(result.plainLanguage).toContain('Spearman')
  })

  it('uses Spearman for full matrix when any column is skewed', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeColumn('A', makeNormal(50)),
        makeColumn('B', makeNormal(50, 30)),
        makeColumn('C', makeSkewedRevenue(50)),
      ],
      n: 50,
    }
    const result = await plugin.run(data)
    const corr = (result.data as any).result
    expect(corr.correlationMethod).toBe('spearman')
    // Matrix should still have correct dimensions
    expect(corr.matrix.length).toBe(3)
    expect(corr.matrix[0].length).toBe(3)
  })
})

// ============================================================
// SegmentProfilePlugin — median + payer rate
// ============================================================

describe('SegmentProfilePlugin — median and payer rate', () => {
  const plugin = AnalysisRegistry.get('segment_profile')!

  it('computes nonZeroRate for zero-inflated columns', async () => {
    const n = 60
    const revenueVals = Array.from({ length: n }, (_, i) => i < 40 ? 0 : (i * 10))
    const segVals = Array.from({ length: n }, (_, i) => i < 30 ? 'A' : 'B')
    const data: ResolvedColumnData = {
      columns: [makeColumn('revenue', revenueVals)],
      segment: makeColumn('segment', segVals),
      n,
    }
    const result = await plugin.run(data)
    const profileResult = (result.data as any).result
    expect(profileResult.zeroInflatedColumns).toContain('revenue')
    // Each profile should have nonZeroRate
    for (const p of profileResult.profiles) {
      expect(p.means[0].nonZeroRate).toBeDefined()
      expect(typeof p.means[0].nonZeroRate).toBe('number')
    }
  })

  it('reports median for skewed columns', async () => {
    const n = 60
    const vals = makeSkewedRevenue(n)
    const segVals = Array.from({ length: n }, (_, i) => i < 30 ? 'A' : 'B')
    const data: ResolvedColumnData = {
      columns: [makeColumn('revenue', vals)],
      segment: makeColumn('segment', segVals),
      n,
    }
    const result = await plugin.run(data)
    const profileResult = (result.data as any).result
    expect(profileResult.skewedColumns.length).toBeGreaterThan(0)
    // Each profile should have median computed
    for (const p of profileResult.profiles) {
      expect(typeof p.means[0].median).toBe('number')
    }
  })

  it('preserves existing behavior for normal columns', async () => {
    const n = 60
    const vals = makeNormal(n)
    const segVals = Array.from({ length: n }, (_, i) => i < 30 ? 'A' : 'B')
    const data: ResolvedColumnData = {
      columns: [makeColumn('score', vals)],
      segment: makeColumn('segment', segVals),
      n,
    }
    const result = await plugin.run(data)
    const profileResult = (result.data as any).result
    expect(profileResult.skewedColumns.length).toBe(0)
    expect(profileResult.zeroInflatedColumns.length).toBe(0)
    // nonZeroRate should not be set
    for (const p of profileResult.profiles) {
      expect(p.means[0].nonZeroRate).toBeUndefined()
    }
  })
})

// ============================================================
// RegressionPlugin — log-transform for spend outcomes
// ============================================================

describe('RegressionPlugin — log-transform', () => {
  const plugin = AnalysisRegistry.get('regression')!

  it('applies log1p for spend outcome with skewness > 2', async () => {
    const n = 100
    const revenue = makeSkewedRevenue(n)
    const predictor = makeNormal(n, 5, 2)
    const data: ResolvedColumnData = {
      columns: [
        makeColumn('gross_revenue', revenue),
        makeColumn('engagement', predictor),
      ],
      n,
    }
    const result = await plugin.run(data)
    const regResult = (result.data as any).result
    expect(regResult.logTransformed).toBe(true)
    expect(regResult.outcomeSkewness).toBeDefined()
    // Should have log_transform_applied flag
    const flags = result.findings[0]?.flags ?? []
    const logFlag = flags.find((f: any) => f.type === 'log_transform_applied')
    expect(logFlag).toBeDefined()
  })

  it('does NOT auto-transform non-spend skewed outcome', async () => {
    const n = 100
    const skewed = makeSkewedRevenue(n) // same data but non-spend name
    const predictor = makeNormal(n, 5, 2)
    const data: ResolvedColumnData = {
      columns: [
        makeColumn('games_played', skewed),
        makeColumn('engagement', predictor),
      ],
      n,
    }
    const result = await plugin.run(data)
    const regResult = (result.data as any).result
    expect(regResult.logTransformed).toBe(false)
    // Should still have skewness warning
    const flags = result.findings[0]?.flags ?? []
    const skewFlag = flags.find((f: any) => f.type === 'skewed_outcome')
    expect(skewFlag).toBeDefined()
    expect(skewFlag.message).toContain('skewed')
  })

  it('no warning for non-skewed outcome', async () => {
    const n = 100
    const normal = makeNormal(n)
    const predictor = makeNormal(n, 5, 2)
    const data: ResolvedColumnData = {
      columns: [
        makeColumn('satisfaction', normal),
        makeColumn('quality', predictor),
      ],
      n,
    }
    const result = await plugin.run(data)
    const regResult = (result.data as any).result
    expect(regResult.logTransformed).toBe(false)
    const flags = result.findings[0]?.flags ?? []
    const skewFlags = flags.filter((f: any) => f.type === 'skewed_outcome' || f.type === 'log_transform_applied')
    expect(skewFlags.length).toBe(0)
  })
})

// ============================================================
// TaskProposer — descriptives wiring
// ============================================================

describe('TaskProposer — descriptives for behavioral', () => {
  // Import after plugin registration
  it('proposes descriptives for behavioral blocks', async () => {
    const { proposeTasks } = await import('../../src/engine/TaskProposer')
    const blocks = [{
      id: 'b1', label: 'Revenue', format: 'behavioral' as const, questionType: 'behavioral' as const,
      columns: [{
        id: 'b1_c', name: 'revenue', format: 'behavioral' as const, type: 'behavioral' as const,
        statisticalType: 'continuous' as const, role: 'metric' as const,
        nRows: 50, nMissing: 0, nullMeaning: 'missing' as const,
        rawValues: Array.from({ length: 50 }, (_, i) => i * 10),
        fingerprint: null, semanticDetectionCache: null,
        transformStack: [], sensitivity: 'anonymous' as const, declaredScaleRange: null,
        behavioralRole: 'metric' as const,
      }],
      role: 'metric' as const, confirmed: true, pastedAt: Date.now(),
    }]
    const tasks = proposeTasks(blocks)
    const descTasks = tasks.filter((t) => t.pluginId === 'descriptives')
    expect(descTasks.length).toBeGreaterThanOrEqual(1)
  })
})
