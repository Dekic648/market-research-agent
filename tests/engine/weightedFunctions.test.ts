/**
 * Tests for weighted analysis engine functions.
 */
import { describe, it, expect } from 'vitest'
import * as StatsEngine from '../../src/engine/stats-engine'

describe('weightedMean', () => {
  it('returns unweighted mean when all weights are equal', () => {
    // @ts-ignore
    const result = StatsEngine.weightedMean([1, 2, 3], [1, 1, 1])
    expect(result).toBe(2)
  })

  it('weights toward higher values when weights are unequal', () => {
    // @ts-ignore
    const result = StatsEngine.weightedMean([1, 3], [1, 3])
    // (1*1 + 3*3) / (1+3) = 10/4 = 2.5
    expect(result).toBe(2.5)
  })

  it('throws when arrays have different lengths', () => {
    expect(() => {
      // @ts-ignore
      StatsEngine.weightedMean([1, 2], [1])
    }).toThrow()
  })

  it('throws when sum of weights is zero', () => {
    expect(() => {
      // @ts-ignore
      StatsEngine.weightedMean([1, 2, 3], [0, 0, 0])
    }).toThrow()
  })
})

describe('weightedFrequency', () => {
  it('computes correct weighted percentages', () => {
    // @ts-ignore
    const result = StatsEngine.weightedFrequency(['A', 'A', 'B', 'B', 'B'], [1, 1, 2, 2, 2])
    // A: count=2, weightedCount=2, pct=2/8*100=25%
    // B: count=3, weightedCount=6, pct=6/8*100=75%
    const a = result.get('A')
    const b = result.get('B')
    expect(a).toBeDefined()
    expect(a!.count).toBe(2)
    expect(a!.weightedCount).toBe(2)
    expect(a!.pct).toBeCloseTo(25, 0)
    expect(b!.count).toBe(3)
    expect(b!.pct).toBeCloseTo(75, 0)
  })

  it('percentages sum to 100', () => {
    // @ts-ignore
    const result = StatsEngine.weightedFrequency([1, 2, 3, 1, 2], [0.5, 1.5, 2, 0.5, 1.5])
    let sumPct = 0
    for (const [, val] of result) sumPct += val.pct
    expect(sumPct).toBeCloseTo(100, 0)
  })
})

describe('weightedDescribe', () => {
  it('computes effective N less than n when weights vary', () => {
    // @ts-ignore
    const result = StatsEngine.weightedDescribe([1, 2, 3, 4, 5], [1, 1, 1, 1, 10])
    // Effective N = (sum(w))^2 / sum(w^2) = 14^2 / (4+100) = 196/104 ≈ 1.88
    expect(result.n).toBe(5)
    expect(result.effectiveN).toBeLessThan(5)
    expect(result.effectiveN).toBeGreaterThan(1)
  })

  it('effective N equals n when all weights are equal', () => {
    // @ts-ignore
    const result = StatsEngine.weightedDescribe([1, 2, 3], [1, 1, 1])
    // effectiveN = 3^2 / 3 = 3
    expect(result.effectiveN).toBeCloseTo(3, 5)
    expect(result.mean).toBe(2)
  })

  it('computes weighted mean correctly', () => {
    // @ts-ignore
    const result = StatsEngine.weightedDescribe([10, 20], [3, 1])
    // mean = (10*3 + 20*1) / (3+1) = 50/4 = 12.5
    expect(result.mean).toBe(12.5)
  })

  it('computes sd from weighted variance', () => {
    // @ts-ignore
    const result = StatsEngine.weightedDescribe([1, 2, 3], [1, 1, 1])
    expect(result.sd).toBeGreaterThan(0)
  })
})

describe('validateWeights', () => {
  it('rejects negative weights', () => {
    // @ts-ignore
    const result = StatsEngine.validateWeights([1, -0.5, 2])
    expect(result.valid).toBe(false)
    expect(result.warning).toContain('negative')
  })

  it('rejects zero-sum weights', () => {
    // @ts-ignore
    const result = StatsEngine.validateWeights([0, 0, 0])
    expect(result.valid).toBe(false)
    expect(result.warning).toContain('zero')
  })

  it('warns when weights dont sum to 1', () => {
    // @ts-ignore
    const result = StatsEngine.validateWeights([2, 3, 5])
    expect(result.valid).toBe(true)
    expect(result.warning).toContain('sum to')
  })

  it('no warning when weights sum to 1', () => {
    // @ts-ignore
    const result = StatsEngine.validateWeights([0.25, 0.25, 0.25, 0.25])
    expect(result.valid).toBe(true)
    expect(result.warning).toBeNull()
  })
})
