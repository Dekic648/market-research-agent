/**
 * Cook's Distance tests — per-observation influence measure.
 */
import { describe, it, expect } from 'vitest'
import { cooksDistance, linearRegression } from '../../src/engine/stats-engine'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../../src/plugins/types'

import '../../src/plugins/RegressionPlugin'

// ============================================================
// cooksDistance() function
// ============================================================

describe('cooksDistance', () => {
  it('flags an extreme outlier as influential', () => {
    // Clean linear data with one extreme outlier at the end
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    const y = x.map((v) => 2 * v + 3) // perfect line y = 2x + 3
    // Make observation 19 (index 19) an extreme outlier
    y[19] = 200 // should be ~43, but is 200

    // @ts-ignore
    const reg = linearRegression(y, [x])
    // @ts-ignore
    const cooks = cooksDistance(y, [x], reg)

    expect(cooks.values.length).toBe(20)
    expect(cooks.threshold).toBeCloseTo(4 / 20, 5)

    // The outlier at index 19 should have the highest Cook's D
    const maxIdx = cooks.values.indexOf(Math.max(...cooks.values))
    expect(maxIdx).toBe(19)

    // It should exceed the threshold
    expect(cooks.influentialIndices).toContain(19)
    expect(cooks.influentialCount).toBeGreaterThanOrEqual(1)
  })

  it('returns all values below threshold for clean data', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    const y = x.map((v) => 2 * v + 3 + (v % 3 - 1) * 0.5) // slight noise

    // @ts-ignore
    const reg = linearRegression(y, [x])
    // @ts-ignore
    const cooks = cooksDistance(y, [x], reg)

    expect(cooks.influentialCount).toBe(0)
    expect(cooks.influentialIndices).toEqual([])
    expect(cooks.values.every((d: number) => d < cooks.threshold)).toBe(true)
  })

  it('correctly counts multiple influential observations', () => {
    const x = Array.from({ length: 30 }, (_, i) => i + 1)
    const y = x.map((v) => v * 2)
    // Add two extreme outliers
    y[0] = 500
    y[29] = -500

    // @ts-ignore
    const reg = linearRegression(y, [x])
    // @ts-ignore
    const cooks = cooksDistance(y, [x], reg)

    expect(cooks.influentialCount).toBeGreaterThanOrEqual(2)
    expect(cooks.influentialIndices).toContain(0)
    expect(cooks.influentialIndices).toContain(29)
  })

  it('handles n <= p gracefully', () => {
    // 2 observations, 2 parameters (intercept + 1 predictor) — n = p
    const y = [1, 2]
    const x = [1, 2]

    // @ts-ignore
    const reg = linearRegression(y, [x])
    // @ts-ignore
    const cooks = cooksDistance(y, [x], reg)

    expect(cooks.values).toEqual([])
    expect(cooks.influentialCount).toBe(0)
    expect(cooks.error).toBeDefined()
  })

  it('handles n = 1 gracefully', () => {
    // @ts-ignore
    const reg = linearRegression([5], [[3]])
    // @ts-ignore
    const cooks = cooksDistance([5], [[3]], reg)

    expect(cooks.values).toEqual([])
    expect(cooks.influentialCount).toBe(0)
  })
})

// ============================================================
// RegressionPlugin integration with Cook's D
// ============================================================

describe('RegressionPlugin Cook\'s D integration', () => {
  it('finding has influential_outliers flag when outlier present', async () => {
    const n = 30
    const x1 = Array.from({ length: n }, (_, i) => i + 1)
    const y = x1.map((v) => v * 2 + 3)
    // Extreme outlier
    y[0] = 500

    const data: ResolvedColumnData = {
      columns: [
        { id: 'y', name: 'Outcome', values: y },
        { id: 'x1', name: 'Predictor', values: x1 },
      ],
      n,
    }

    const plugin = AnalysisRegistry.get('regression')!
    const result = await plugin.run(data)

    const finding = result.findings[0]
    expect(finding.flags).toBeDefined()
    expect(finding.flags!.length).toBeGreaterThan(0)
    const cooksFlag = finding.flags!.find((f: any) => f.type === 'influential_outliers')
    expect(cooksFlag).toBeDefined()
    expect(cooksFlag!.message).toContain("Cook's D")
  })

  it('no influential_outliers flag for clean data', async () => {
    const n = 40
    const x1 = Array.from({ length: n }, (_, i) => (i % 5) + 1)
    const y = x1.map((v, i) => v * 2 + 3 + (i % 3 - 1) * 0.3)

    const data: ResolvedColumnData = {
      columns: [
        { id: 'y', name: 'Outcome', values: y },
        { id: 'x1', name: 'Predictor', values: x1 },
      ],
      n,
    }

    const plugin = AnalysisRegistry.get('regression')!
    const result = await plugin.run(data)

    const finding = result.findings[0]
    // No flags or empty flags
    expect(!finding.flags || finding.flags.length === 0).toBe(true)
  })

  it('AnalysisLog entry contains influentialOutlierCount', async () => {
    const n = 30
    const x1 = Array.from({ length: n }, (_, i) => i + 1)
    const y = x1.map((v) => v * 2 + 3)
    y[0] = 500

    const data: ResolvedColumnData = {
      columns: [
        { id: 'y', name: 'Outcome', values: y },
        { id: 'x1', name: 'Predictor', values: x1 },
      ],
      n,
    }

    const plugin = AnalysisRegistry.get('regression')!
    const result = await plugin.run(data)

    const payload = result.logEntry.payload as any
    expect(typeof payload.influentialOutlierCount).toBe('number')
    expect(typeof payload.cooksThreshold).toBe('number')
  })
})
