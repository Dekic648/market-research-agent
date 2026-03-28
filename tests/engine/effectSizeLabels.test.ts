/**
 * Effect size label utility tests — boundary values and df-dependent behavior.
 */
import { describe, it, expect } from 'vitest'
import {
  labelCohensD,
  labelCorrelation,
  labelRSquared,
  labelCramersV,
  labelEpsilonSquared,
  labelAlpha,
} from '../../src/engine/effectSizeLabels'

describe('labelCohensD', () => {
  it('returns negligible below 0.2', () => {
    expect(labelCohensD(0)).toBe('negligible')
    expect(labelCohensD(0.19)).toBe('negligible')
    expect(labelCohensD(-0.1)).toBe('negligible')
  })

  it('returns small at 0.2', () => {
    expect(labelCohensD(0.2)).toBe('small')
    expect(labelCohensD(0.49)).toBe('small')
  })

  it('returns moderate at 0.5', () => {
    expect(labelCohensD(0.5)).toBe('moderate')
    expect(labelCohensD(0.79)).toBe('moderate')
  })

  it('returns large at 0.8+', () => {
    expect(labelCohensD(0.8)).toBe('large')
    expect(labelCohensD(1.5)).toBe('large')
    expect(labelCohensD(-1.0)).toBe('large')
  })
})

describe('labelCorrelation', () => {
  it('returns negligible below 0.1', () => {
    expect(labelCorrelation(0)).toBe('negligible')
    expect(labelCorrelation(0.09)).toBe('negligible')
  })

  it('returns weak from 0.1 to 0.3', () => {
    expect(labelCorrelation(0.1)).toBe('weak')
    expect(labelCorrelation(0.29)).toBe('weak')
    expect(labelCorrelation(-0.2)).toBe('weak')
  })

  it('returns moderate from 0.3 to 0.5', () => {
    expect(labelCorrelation(0.3)).toBe('moderate')
    expect(labelCorrelation(0.49)).toBe('moderate')
  })

  it('returns strong at 0.5+', () => {
    expect(labelCorrelation(0.5)).toBe('strong')
    expect(labelCorrelation(0.9)).toBe('strong')
    expect(labelCorrelation(-0.7)).toBe('strong')
  })
})

describe('labelRSquared', () => {
  it('returns weak below 0.13', () => {
    expect(labelRSquared(0)).toBe('weak')
    expect(labelRSquared(0.12)).toBe('weak')
  })

  it('returns moderate from 0.13 to 0.26', () => {
    expect(labelRSquared(0.13)).toBe('moderate')
    expect(labelRSquared(0.25)).toBe('moderate')
  })

  it('returns strong at 0.26+', () => {
    expect(labelRSquared(0.26)).toBe('strong')
    expect(labelRSquared(0.8)).toBe('strong')
  })
})

describe('labelCramersV', () => {
  it('uses df=1 thresholds (0.1, 0.3, 0.5)', () => {
    expect(labelCramersV(0.05, 1)).toBe('negligible')
    expect(labelCramersV(0.1, 1)).toBe('small')
    expect(labelCramersV(0.3, 1)).toBe('moderate')
    expect(labelCramersV(0.5, 1)).toBe('large')
  })

  it('uses df=2 thresholds (0.07, 0.21, 0.35)', () => {
    expect(labelCramersV(0.05, 2)).toBe('negligible')
    expect(labelCramersV(0.07, 2)).toBe('small')
    expect(labelCramersV(0.21, 2)).toBe('moderate')
    expect(labelCramersV(0.35, 2)).toBe('large')
  })

  it('uses df=3+ thresholds (0.06, 0.17, 0.29)', () => {
    expect(labelCramersV(0.05, 3)).toBe('negligible')
    expect(labelCramersV(0.06, 3)).toBe('small')
    expect(labelCramersV(0.17, 3)).toBe('moderate')
    expect(labelCramersV(0.29, 3)).toBe('large')

    // Same thresholds for df=5
    expect(labelCramersV(0.05, 5)).toBe('negligible')
    expect(labelCramersV(0.29, 5)).toBe('large')
  })
})

describe('labelEpsilonSquared', () => {
  it('returns negligible below 0.01', () => {
    expect(labelEpsilonSquared(0)).toBe('negligible')
    expect(labelEpsilonSquared(0.009)).toBe('negligible')
  })

  it('returns small from 0.01 to 0.04', () => {
    expect(labelEpsilonSquared(0.01)).toBe('small')
    expect(labelEpsilonSquared(0.039)).toBe('small')
  })

  it('returns moderate from 0.04 to 0.16', () => {
    expect(labelEpsilonSquared(0.04)).toBe('moderate')
    expect(labelEpsilonSquared(0.159)).toBe('moderate')
  })

  it('returns large at 0.16+', () => {
    expect(labelEpsilonSquared(0.16)).toBe('large')
    expect(labelEpsilonSquared(0.5)).toBe('large')
  })
})

describe('labelAlpha', () => {
  it('returns correct levels at boundaries', () => {
    expect(labelAlpha(0.95)).toBe('excellent')
    expect(labelAlpha(0.9)).toBe('excellent')
    expect(labelAlpha(0.85)).toBe('good')
    expect(labelAlpha(0.8)).toBe('good')
    expect(labelAlpha(0.75)).toBe('acceptable')
    expect(labelAlpha(0.7)).toBe('acceptable')
    expect(labelAlpha(0.65)).toBe('questionable')
    expect(labelAlpha(0.6)).toBe('questionable')
    expect(labelAlpha(0.55)).toBe('poor')
    expect(labelAlpha(0.5)).toBe('poor')
    expect(labelAlpha(0.4)).toBe('unacceptable')
  })
})
