/**
 * Tests for Batch 2, 3, and 4 plugins.
 */
import { describe, it, expect } from 'vitest'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../../src/plugins/types'

// Import to trigger registration — Batch 1
import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/CrosstabPlugin'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/PostHocPlugin'
// Batch 2-4
import '../../src/plugins/ReliabilityPlugin'
import '../../src/plugins/FactorPlugin'
import '../../src/plugins/RegressionPlugin'
import '../../src/plugins/DriverPlugin'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/PointBiserialPlugin'
import '../../src/plugins/SegmentProfilePlugin'

// ============================================================
// Helpers
// ============================================================

// Scale items with known reliability
const item1 = [4, 5, 3, 4, 5, 4, 3, 5, 4, 5, 3, 4, 5, 4, 3, 4, 5, 3, 4, 5, 4, 3, 5, 4, 5, 3, 4, 5, 4, 3, 4, 5]
const item2 = [3, 4, 3, 4, 5, 3, 3, 4, 4, 5, 3, 4, 4, 3, 3, 3, 4, 3, 4, 5, 3, 3, 4, 4, 5, 3, 4, 4, 3, 3, 3, 4]
const item3 = [4, 5, 4, 5, 5, 4, 3, 5, 4, 5, 3, 5, 5, 4, 3, 4, 5, 4, 5, 5, 4, 3, 5, 4, 5, 3, 5, 5, 4, 3, 4, 5]
const item4 = [3, 4, 2, 3, 4, 3, 2, 4, 3, 4, 2, 3, 4, 3, 2, 3, 4, 2, 3, 4, 3, 2, 4, 3, 4, 2, 3, 4, 3, 2, 3, 4]

// ============================================================
// Registration check
// ============================================================

describe('All 11 plugins registered', () => {
  it('has all plugin IDs', () => {
    const ids = ['frequency', 'crosstab', 'kw_significance', 'posthoc',
      'cronbach', 'efa', 'regression', 'driver_analysis',
      'correlation', 'point_biserial', 'segment_profile']
    for (const id of ids) {
      expect(AnalysisRegistry.get(id)).toBeDefined()
    }
  })
})

// ============================================================
// Batch 2: Reliability + Factor
// ============================================================

describe('ReliabilityPlugin', () => {
  it('computes Cronbach alpha', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'i1', name: 'Item 1', values: item1 },
        { id: 'i2', name: 'Item 2', values: item2 },
        { id: 'i3', name: 'Item 3', values: item3 },
        { id: 'i4', name: 'Item 4', values: item4 },
      ],
      n: item1.length,
    }

    const plugin = AnalysisRegistry.get('cronbach')!
    const result = await plugin.run(data)
    const r = (result.data as any).result

    expect(r.alpha).toBeGreaterThan(0.5)
    expect(r.alpha).toBeLessThanOrEqual(1)
    expect(r.k).toBe(4)
    expect(r.itemTotalCorrelations).toHaveLength(4)
    expect(r.alphaIfDeleted).toHaveLength(4)
    expect(result.charts.length).toBeGreaterThan(0)
    expect(result.findings.length).toBe(1)
  })
})

describe('FactorPlugin', () => {
  it('extracts factors from scale items', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'i1', name: 'Item 1', values: item1 },
        { id: 'i2', name: 'Item 2', values: item2 },
        { id: 'i3', name: 'Item 3', values: item3 },
        { id: 'i4', name: 'Item 4', values: item4 },
      ],
      n: item1.length,
    }

    const plugin = AnalysisRegistry.get('efa')!
    const result = await plugin.run(data)
    const r = (result.data as any).result

    expect(r.nFactors).toBeGreaterThanOrEqual(1)
    expect(r.eigenvalues.length).toBeGreaterThan(0)
    expect(r.loadings.length).toBe(4) // 4 items
    expect(result.charts.some((c: any) => c.type === 'scatterPlot')).toBe(true) // scree
    expect(result.charts.some((c: any) => c.type === 'heatmap')).toBe(true)     // loadings
  })
})

// ============================================================
// Batch 3: Regression + Driver
// ============================================================

describe('RegressionPlugin', () => {
  it('runs linear regression', async () => {
    const x1 = Array.from({ length: 40 }, (_, i) => (i % 5) + 1)
    const x2 = Array.from({ length: 40 }, (_, i) => ((i + 2) % 5) + 1)
    const y = x1.map((v, i) => 2 * v + 1.5 * x2[i] + 3 + (i % 3 - 1) * 0.2)

    const data: ResolvedColumnData = {
      columns: [
        { id: 'y', name: 'Satisfaction', values: y },
        { id: 'x1', name: 'Quality', values: x1 },
        { id: 'x2', name: 'Price', values: x2 },
      ],
      n: 40,
    }

    const plugin = AnalysisRegistry.get('regression')!
    const result = await plugin.run(data)
    const r = (result.data as any).result

    expect(r.R2).toBeGreaterThan(0.9)
    expect(r.coefficients.length).toBe(3) // intercept + 2 predictors
    expect(r.coefficients.find((c: any) => c.name === 'Quality').p).toBeLessThan(0.05)
    expect(result.charts.some((c: any) => c.type === 'betaImportance')).toBe(true)
  })
})

describe('DriverPlugin', () => {
  it('ranks predictors by importance', async () => {
    const x1 = Array.from({ length: 50 }, (_, i) => (i % 5) + 1)
    const x2 = Array.from({ length: 50 }, (_, i) => ((i + 2) % 5) + 1)
    const x3 = Array.from({ length: 50 }, (_, i) => ((i + 3) % 5) + 1)
    // x1 is the strongest driver
    const y = x1.map((v, i) => 3 * v + 0.5 * x2[i] + 0.1 * x3[i] + (i % 3 - 1) * 0.1)

    const data: ResolvedColumnData = {
      columns: [
        { id: 'y', name: 'Overall SAT', values: y },
        { id: 'x1', name: 'Quality', values: x1 },
        { id: 'x2', name: 'Price', values: x2 },
        { id: 'x3', name: 'Speed', values: x3 },
      ],
      n: 50,
    }

    const plugin = AnalysisRegistry.get('driver_analysis')!
    const result = await plugin.run(data)
    const r = (result.data as any).result

    expect(r.predictors.length).toBe(3)
    expect(r.predictors[0].name).toBe('Quality') // strongest driver
    expect(r.predictors[0].importance).toBeGreaterThan(0.5)
    expect(r.R2).toBeGreaterThan(0.9)
  })
})

// ============================================================
// Batch 4: Correlation + PointBiserial + SegmentProfile
// ============================================================

describe('CorrelationPlugin', () => {
  it('computes correlation matrix', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'x', name: 'X', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
        { id: 'y', name: 'Y', values: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20] },
        { id: 'z', name: 'Z', values: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      n: 10,
    }

    const plugin = AnalysisRegistry.get('correlation')!
    const result = await plugin.run(data)
    const r = (result.data as any).result

    expect(r.matrix.length).toBe(3)
    expect(r.matrix[0][1]).toBeCloseTo(1.0, 2) // X-Y perfect positive
    expect(r.matrix[0][2]).toBeCloseTo(-1.0, 2) // X-Z perfect negative
    expect(r.strongPairs.length).toBeGreaterThan(0)
    expect(result.charts.some((c: any) => c.type === 'heatmap')).toBe(true)
  })
})

describe('PointBiserialPlugin', () => {
  it('computes binary × continuous correlation', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'bin', name: 'Group', values: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1] },
        { id: 'cont', name: 'Score', values: [3, 4, 3, 2, 4, 3, 3, 7, 8, 7, 6, 8, 7, 7] },
      ],
      n: 14,
    }

    const plugin = AnalysisRegistry.get('point_biserial')!
    const result = await plugin.run(data)
    const r = (result.data as any).results

    expect(r.length).toBe(1)
    expect(Math.abs(r[0].r)).toBeGreaterThan(0.7)
    expect(r[0].p).toBeLessThan(0.05)
    expect(r[0].mean0).toBeLessThan(r[0].mean1)
  })
})

describe('SegmentProfilePlugin', () => {
  it('produces per-segment profiles', async () => {
    const seg = ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B']
    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Quality', values: [4, 5, 4, 5, 4, 2, 3, 2, 3, 2] },
        { id: 'q2', name: 'Price', values: [3, 3, 3, 3, 3, 4, 4, 4, 4, 4] },
      ],
      segment: { id: 'seg', name: 'Segment', values: seg },
      n: 10,
    }

    const plugin = AnalysisRegistry.get('segment_profile')!
    const result = await plugin.run(data)
    const r = (result.data as any).result

    expect(r.profiles.length).toBe(2)
    expect(r.profiles.find((p: any) => p.segment === 'A').n).toBe(5)
    expect(r.overallMeans.length).toBe(2)
    expect(result.charts.some((c: any) => c.type === 'radarChart')).toBe(true)
    expect(result.charts.some((c: any) => c.type === 'groupedBar')).toBe(true)
  })

  it('computes vsAverage deviation', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Q1', values: [5, 5, 5, 5, 5, 1, 1, 1, 1, 1] },
      ],
      segment: { id: 'seg', name: 'Group', values: ['High', 'High', 'High', 'High', 'High', 'Low', 'Low', 'Low', 'Low', 'Low'] },
      n: 10,
    }

    const plugin = AnalysisRegistry.get('segment_profile')!
    const result = await plugin.run(data)
    const r = (result.data as any).result

    const highProfile = r.profiles.find((p: any) => p.segment === 'High')
    const lowProfile = r.profiles.find((p: any) => p.segment === 'Low')

    expect(highProfile.means[0].vsAverage).toBeGreaterThan(0)
    expect(lowProfile.means[0].vsAverage).toBeLessThan(0)
  })
})
