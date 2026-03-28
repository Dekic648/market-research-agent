/**
 * Subtype auto-detection tests.
 */
import { describe, it, expect } from 'vitest'
import { detectBehavioralSubtype, detectCategorySubtype } from '../../src/parsers/subtypeDetector'
import { computeFingerprint } from '../../src/parsers/fingerprint'
import { CapabilityMatcher } from '../../src/engine/CapabilityMatcher'

function fp(values: (number | string | null)[]) {
  return computeFingerprint(values, 'test')
}

// ============================================================
// Behavioral subtypes
// ============================================================

describe('detectBehavioralSubtype', () => {
  it('proportion: range [0,1], not all integers', () => {
    const values = [0.0, 0.15, 0.42, 0.78, 0.91, 0.33, 0.0, 0.55, 0.12, 0.67]
    expect(detectBehavioralSubtype(values, fp(values))).toBe('proportion')
  })

  it('spend: zero-inflated + right-skewed', () => {
    const values = [0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 50, 0, 0, 0, 100, 0, 200]
    expect(detectBehavioralSubtype(values, fp(values))).toBe('spend')
  })

  it('count: non-negative integers', () => {
    const values = [0, 1, 5, 12, 3, 45, 100, 7, 22, 8, 15, 30, 55, 2, 0, 1, 3, 67, 44, 11]
    expect(detectBehavioralSubtype(values, fp(values))).toBe('count')
  })

  it('ordinal_rank: integers, small range, natural order', () => {
    const values = [1, 3, 5, 7, 2, 4, 6, 8, 1, 3, 5, 7, 10, 2, 4]
    expect(detectBehavioralSubtype(values, fp(values))).toBe('ordinal_rank')
  })

  it('metric: general continuous, none of the above', () => {
    const values = [-5.3, 12.7, -0.5, 44.1, -22.8, 3.14, 99.9, -15.2, 7.77, 0.01]
    expect(detectBehavioralSubtype(values, fp(values))).toBe('metric')
  })

  it('proportion wins over ordinal_rank for [0,1] floats', () => {
    const values = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.0]
    expect(detectBehavioralSubtype(values, fp(values))).toBe('proportion')
  })
})

// ============================================================
// Category subtypes
// ============================================================

describe('detectCategorySubtype', () => {
  it('prefixed_ordinal: "0) NonPayer" pattern', () => {
    const values = ['0) NonPayer', '1) ExPayer', '2) Minnow', '3) Dolphin', '4) Whale',
                    '0) NonPayer', '1) ExPayer', '2) Minnow', '0) NonPayer', '3) Dolphin']
    expect(detectCategorySubtype(values, fp(values), 'Player Type')).toBe('prefixed_ordinal')
  })

  it('geo: column name contains "country"', () => {
    const values = ['US', 'UK', 'DE', 'FR', 'JP', 'US', 'UK', 'DE', 'US', 'FR']
    expect(detectCategorySubtype(values, fp(values), 'Country')).toBe('geo')
  })

  it('geo: column name contains "region"', () => {
    const values = ['EMEA', 'APAC', 'NA', 'LATAM', 'EMEA']
    expect(detectCategorySubtype(values, fp(values), 'Region')).toBe('geo')
  })

  it('constant: only one unique value', () => {
    const values = ['US', 'US', 'US', 'US', 'US']
    expect(detectCategorySubtype(values, fp(values), 'Market')).toBe('constant')
  })

  it('nominal: regular categories', () => {
    const values = ['Male', 'Female', 'Other', 'Male', 'Female', 'Male', 'Female', 'Other', 'Male', 'Female']
    expect(detectCategorySubtype(values, fp(values), 'Gender')).toBe('nominal')
  })
})

// ============================================================
// Capability integration
// ============================================================

describe('CapabilityMatcher with subtypes', () => {
  // These tests are in plugins.test.ts already — this validates
  // that the detector output feeds correctly into capabilities
  it('ordinal_rank behavioral gets ordinal capability', () => {
    const values = [1, 3, 5, 7, 2, 4, 6, 8, 1, 3]
    const col = {
      id: 'rank', name: 'Rank', type: 'behavioral',
      behavioralSubtype: 'ordinal_rank',
      subtype: 'ordinal_rank',
      nRows: 10, nMissing: 0, rawValues: values,
      fingerprint: null, semanticDetectionCache: null,
      transformStack: [], sensitivity: 'anonymous', declaredScaleRange: null,
    }
    const caps = CapabilityMatcher.resolveFromColumns([col])
    expect(caps.has('continuous')).toBe(true)
    expect(caps.has('ordinal')).toBe(true)
  })
})
