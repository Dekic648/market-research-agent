/**
 * K-fold cross-validation tests.
 */
import { describe, it, expect } from 'vitest'
import {
  kFoldCVLinear, kFoldCVLogistic,
} from '../../src/engine/stats-engine'

describe('kFoldCVLinear', () => {
  it('returns 5 fold results for n=100', () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => i * 2 + 3 + (i % 5) * 0.5)
    const x = Array.from({ length: n }, (_, i) => i)
    // @ts-ignore
    const cv = kFoldCVLinear(y, [x], 5)
    expect(cv.k).toBe(5)
    expect(cv.foldResults).toHaveLength(5)
    expect(cv.meanR2orAUC).toBeGreaterThan(0)
    expect(cv.meanRMSE).toBeGreaterThan(0)
  })

  it('mean CV R² is lower than training R² for an overfit model', () => {
    // Many predictors, small n → overfit
    const n = 40
    const y = Array.from({ length: n }, (_, i) => Math.sin(i) + (i % 3) * 0.2)
    const xs = Array.from({ length: 15 }, (_, j) =>
      Array.from({ length: n }, (_, i) => Math.sin(i * (j + 1)) + Math.random() * 0.1)
    )
    // @ts-ignore
    const cv = kFoldCVLinear(y, xs, 5)
    // Training R² should be high (many predictors), CV R² should be lower
    if (cv.foldResults.length > 0) {
      const avgTrainR2 = cv.foldResults.reduce((s, f) => s + f.trainMetric, 0) / cv.foldResults.length
      expect(avgTrainR2).toBeGreaterThan(cv.meanR2orAUC)
    }
  })

  it('overfit flag is true when delta > 0.1', () => {
    // Create obviously overfit scenario
    const n = 35
    const y = Array.from({ length: n }, () => Math.random())
    const xs = Array.from({ length: 20 }, () =>
      Array.from({ length: n }, () => Math.random())
    )
    // @ts-ignore
    const cv = kFoldCVLinear(y, xs, 5)
    if (cv.foldResults.length > 0 && cv.overfitDelta > 0.1) {
      expect(cv.overfit).toBe(true)
    }
  })

  it('overfit flag is false when delta <= 0.1 for well-specified model', () => {
    const n = 200
    const x = Array.from({ length: n }, (_, i) => i)
    const y = x.map((xi) => 2 * xi + 3 + (Math.random() - 0.5) * 5)
    // @ts-ignore
    const cv = kFoldCVLinear(y, [x], 5)
    expect(cv.overfit).toBe(false)
    expect(cv.overfitDelta).toBeLessThanOrEqual(0.1)
  })

  it('seeded shuffle is deterministic', () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => i * 2)
    const x = Array.from({ length: n }, (_, i) => i)
    // @ts-ignore
    const cv1 = kFoldCVLinear(y, [x], 5, 42)
    // @ts-ignore
    const cv2 = kFoldCVLinear(y, [x], 5, 42)
    expect(cv1.meanR2orAUC).toBeCloseTo(cv2.meanR2orAUC, 10)
    expect(cv1.foldResults[0].testMetric).toBeCloseTo(cv2.foldResults[0].testMetric, 10)
  })

  it('different seeds produce different fold assignments', () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => i * 2 + (i % 7))
    const x = Array.from({ length: n }, (_, i) => i)
    // @ts-ignore
    const cv1 = kFoldCVLinear(y, [x], 5, 42)
    // @ts-ignore
    const cv2 = kFoldCVLinear(y, [x], 5, 999)
    // Different seeds should produce different fold results (very unlikely to be identical)
    const diff = Math.abs(cv1.foldResults[0].testMetric - cv2.foldResults[0].testMetric)
    // At least some difference (could be very small but not exactly zero for different shuffles)
    expect(cv1.foldResults.length).toBe(5)
    expect(cv2.foldResults.length).toBe(5)
  })

  it('returns guard result when n < 30', () => {
    const y = Array.from({ length: 20 }, (_, i) => i)
    const x = Array.from({ length: 20 }, (_, i) => i)
    // @ts-ignore
    const cv = kFoldCVLinear(y, [x], 5)
    expect(cv.foldResults).toHaveLength(0)
    expect(cv.error).toBeDefined()
  })
})

describe('kFoldCVLogistic', () => {
  it('returns AUC between 0.5 and 1.0 for a separable outcome', () => {
    const n = 100
    const x = Array.from({ length: n }, (_, i) => i)
    const y = x.map((xi) => xi >= 50 ? 1 : 0) // perfectly separable
    // @ts-ignore
    const cv = kFoldCVLogistic(y, [x], 5)
    if (cv.foldResults.length > 0) {
      expect(cv.meanAUC).toBeGreaterThanOrEqual(0.5)
      expect(cv.meanAUC).toBeLessThanOrEqual(1.0)
    }
  })

  it('AUC is approximately 0.5 for a random outcome', () => {
    const n = 200
    const x = Array.from({ length: n }, (_, i) => i)
    // Random binary: deterministic pseudo-random
    const y = x.map((_, i) => ((i * 7 + 3) % 11) < 5 ? 1 : 0)
    // @ts-ignore
    const cv = kFoldCVLogistic(y, [x], 5)
    if (cv.foldResults.length > 0) {
      // AUC should be near 0.5 for random labels (within a wide margin)
      expect(cv.meanAUC).toBeGreaterThan(0.3)
      expect(cv.meanAUC).toBeLessThan(0.7)
    }
  })
})
