/**
 * Unit tests for format predicates — boundary cases per predicate.
 */
import { describe, it, expect } from 'vitest'
import { isOrdinalFormat, isCategoricalFormat, isBinaryFormat, isMultiResponseFormat } from '../../src/engine/formatPredicates'
import type { ColumnDefinition } from '../../src/types/dataTypes'

function makeCol(overrides: Partial<ColumnDefinition>): ColumnDefinition {
  return {
    id: 'c1', name: 'Test', format: 'rating', statisticalType: 'ordinal',
    role: 'analyze', nRows: 10, nMissing: 0, nullMeaning: 'missing',
    rawValues: [], fingerprint: null, semanticDetectionCache: null,
    transformStack: [], sensitivity: 'anonymous', declaredScaleRange: null,
    ...overrides,
  }
}

// ============================================================
// isOrdinalFormat
// ============================================================

describe('isOrdinalFormat', () => {
  it('true for rating', () => {
    expect(isOrdinalFormat(makeCol({ format: 'rating' }))).toBe(true)
  })

  it('true for matrix', () => {
    expect(isOrdinalFormat(makeCol({ format: 'matrix' }))).toBe(true)
  })

  it('true for radio with ordinal statisticalType', () => {
    expect(isOrdinalFormat(makeCol({ format: 'radio', statisticalType: 'ordinal' }))).toBe(true)
  })

  it('false for radio with categorical statisticalType', () => {
    expect(isOrdinalFormat(makeCol({ format: 'radio', statisticalType: 'categorical' }))).toBe(false)
  })

  it('false for checkbox', () => {
    expect(isOrdinalFormat(makeCol({ format: 'checkbox' }))).toBe(false)
  })

  it('false for multi_response', () => {
    expect(isOrdinalFormat(makeCol({ format: 'multi_response' }))).toBe(false)
  })

  it('false for category', () => {
    expect(isOrdinalFormat(makeCol({ format: 'category' }))).toBe(false)
  })

  it('false for behavioral', () => {
    expect(isOrdinalFormat(makeCol({ format: 'behavioral' }))).toBe(false)
  })
})

// ============================================================
// isCategoricalFormat
// ============================================================

describe('isCategoricalFormat', () => {
  it('true for radio', () => {
    expect(isCategoricalFormat(makeCol({ format: 'radio' }))).toBe(true)
  })

  it('true for category', () => {
    expect(isCategoricalFormat(makeCol({ format: 'category' }))).toBe(true)
  })

  it('false for rating', () => {
    expect(isCategoricalFormat(makeCol({ format: 'rating' }))).toBe(false)
  })

  it('false for matrix', () => {
    expect(isCategoricalFormat(makeCol({ format: 'matrix' }))).toBe(false)
  })

  it('false for checkbox', () => {
    expect(isCategoricalFormat(makeCol({ format: 'checkbox' }))).toBe(false)
  })
})

// ============================================================
// isBinaryFormat
// ============================================================

describe('isBinaryFormat', () => {
  it('true for checkbox format', () => {
    expect(isBinaryFormat(makeCol({ format: 'checkbox' }))).toBe(true)
  })

  it('true for binary statisticalType regardless of format', () => {
    expect(isBinaryFormat(makeCol({ format: 'rating', statisticalType: 'binary' }))).toBe(true)
  })

  it('false for rating with ordinal type', () => {
    expect(isBinaryFormat(makeCol({ format: 'rating', statisticalType: 'ordinal' }))).toBe(false)
  })

  it('false for multi_response', () => {
    expect(isBinaryFormat(makeCol({ format: 'multi_response' }))).toBe(false)
  })
})

// ============================================================
// isMultiResponseFormat
// ============================================================

describe('isMultiResponseFormat', () => {
  it('true for multi_response', () => {
    expect(isMultiResponseFormat(makeCol({ format: 'multi_response' }))).toBe(true)
  })

  it('false for checkbox', () => {
    expect(isMultiResponseFormat(makeCol({ format: 'checkbox' }))).toBe(false)
  })

  it('false for rating', () => {
    expect(isMultiResponseFormat(makeCol({ format: 'rating' }))).toBe(false)
  })

  it('false for radio', () => {
    expect(isMultiResponseFormat(makeCol({ format: 'radio' }))).toBe(false)
  })
})
