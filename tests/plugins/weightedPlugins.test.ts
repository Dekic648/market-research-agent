/**
 * Tests for weighted FrequencyPlugin and CrosstabPlugin.
 */
import { describe, it, expect } from 'vitest'
import { FrequencyPlugin } from '../../src/plugins/FrequencyPlugin'
import { CrosstabPlugin } from '../../src/plugins/CrosstabPlugin'
import type { ResolvedColumnData } from '../../src/plugins/types'

// ============================================================
// FrequencyPlugin — weighted
// ============================================================

describe('FrequencyPlugin — weighted', () => {
  it('no weights → output identical to unweighted baseline', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 4, 5] }],
      n: 5,
    }

    const result = await FrequencyPlugin.run(data)
    const freqs = (result.data as any).frequencies
    expect(freqs[0].mean).toBeCloseTo(3.0, 1)
    // No weight annotation
    expect(result.findings[0].summaryLanguage).not.toContain('weighted')
  })

  it('equal weights → output identical to unweighted', async () => {
    const values = [1, 2, 3, 4, 5]
    const weights = [1, 1, 1, 1, 1]
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values }],
      n: 5,
      weights,
    }

    const resultWeighted = await FrequencyPlugin.run(data, weights)
    const resultUnweighted = await FrequencyPlugin.run({ ...data, weights: undefined })

    const fW = (resultWeighted.data as any).frequencies[0]
    const fU = (resultUnweighted.data as any).frequencies[0]

    // Means should be identical
    expect(fW.mean).toBeCloseTo(fU.mean, 2)
  })

  it('unequal weights → weighted mean differs from unweighted', async () => {
    const values = [1, 5] // unweighted mean = 3.0
    const weights = [1, 9] // weighted mean = (1*1 + 5*9) / 10 = 4.6
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values }],
      n: 2,
      weights,
    }

    const result = await FrequencyPlugin.run(data, weights)
    const freq = (result.data as any).frequencies[0]

    // Unweighted mean = 3.0, weighted mean = 4.6
    expect(freq.mean).toBeCloseTo(4.6, 1)

    // summaryLanguage should mention weighted
    expect(result.findings[0].summaryLanguage).toContain('weighted')
  })

  it('invalid weights (negative) → suppressionReason set, unweighted used', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 4, 5] }],
      n: 5,
      weights: [1, -1, 1, 1, 1], // invalid
    }

    const result = await FrequencyPlugin.run(data, data.weights)
    const freq = (result.data as any).frequencies[0]

    // Should fall back to unweighted
    expect(freq.mean).toBeCloseTo(3.0, 1)
    // suppressionReason should be set
    expect(result.findings[0].suppressionReason).toBe('invalid_weights')
  })
})

// ============================================================
// CrosstabPlugin — weighted
// ============================================================

describe('CrosstabPlugin — weighted', () => {
  it('no weights → output identical to current', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 1, 2, 3] }],
      segment: { id: 'seg', name: 'Group', values: ['A', 'A', 'A', 'B', 'B', 'B'] },
      n: 6,
    }

    const result = await CrosstabPlugin.run(data)
    const cts = (result.data as any).crosstabs
    expect(cts).toHaveLength(1)
    // All cells should have integer-like counts
    for (const row of cts[0].table) {
      for (const cell of row) {
        expect(cell.count).toBe(Math.round(cell.count))
      }
    }
  })

  it('equal weights → output identical to unweighted', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 1, 2, 3] }],
      segment: { id: 'seg', name: 'Group', values: ['A', 'A', 'A', 'B', 'B', 'B'] },
      n: 6,
      weights: [1, 1, 1, 1, 1, 1],
    }

    const resultW = await CrosstabPlugin.run(data, [1, 1, 1, 1, 1, 1])
    const resultU = await CrosstabPlugin.run({ ...data, weights: undefined })

    const ctW = (resultW.data as any).crosstabs[0]
    const ctU = (resultU.data as any).crosstabs[0]

    // Grand totals should match
    expect(ctW.grandTotal).toBeCloseTo(ctU.grandTotal, 0)
  })

  it('weighted counts flow through to % computation', async () => {
    // A gets weight 2, B gets weight 1
    // Value 1 in group A, value 2 in group B
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2] }],
      segment: { id: 'seg', name: 'Group', values: ['A', 'B'] },
      n: 2,
      weights: [2, 1],
    }

    const result = await CrosstabPlugin.run(data, [2, 1])
    const ct = (result.data as any).crosstabs[0]

    // Grand total should be 3 (2 + 1), not 2
    expect(ct.grandTotal).toBeCloseTo(3, 0)
  })
})
