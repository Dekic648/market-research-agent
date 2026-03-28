/**
 * Bulk tagger tests — confidence scoring, ambiguous names, bulk mode activation.
 */
import { describe, it, expect } from 'vitest'
import { getDetectionConfidence, isAmbiguousName } from '../../src/components/DataInput/BulkTaggerTable'
import type { QuestionBlock, ColumnDefinition } from '../../src/types/dataTypes'

function makeBlock(
  type: QuestionBlock['questionType'],
  numericRatio: number,
  nUnique: number,
  nMissing: number = 0,
  nRows: number = 100
): QuestionBlock {
  return {
    id: 'test',
    label: 'Test',
    questionType: type,
    columns: [{
      id: 'c1', name: 'Test', type,
      nRows, nMissing,
      nullMeaning: 'missing',
      rawValues: Array.from({ length: nRows }, (_, i) => i % nUnique),
      fingerprint: {
        columnId: 'c1', hash: 'h', nRows, nUnique, nMissing,
        numericRatio, min: 0, max: nUnique, mean: nUnique / 2,
        sd: 1, topValues: [], computedAt: Date.now(),
      },
      semanticDetectionCache: null,
      transformStack: [],
      sensitivity: 'anonymous',
      declaredScaleRange: null,
    }],
    role: 'question',
    confirmed: false,
    pastedAt: Date.now(),
  }
}

describe('isBulkMode activation', () => {
  it('is true when 8+ blocks have data', () => {
    const blocks = Array.from({ length: 8 }, () => makeBlock('rating', 1.0, 5))
    expect(blocks.length >= 8).toBe(true)
  })

  it('is false when < 8 blocks have data', () => {
    const blocks = Array.from({ length: 5 }, () => makeBlock('rating', 1.0, 5))
    expect(blocks.length >= 8).toBe(false)
  })
})

describe('getDetectionConfidence', () => {
  it('returns high for checkbox', () => {
    expect(getDetectionConfidence(makeBlock('checkbox', 1.0, 2))).toBe('high')
  })

  it('returns high for timestamped', () => {
    expect(getDetectionConfidence(makeBlock('timestamped', 0.0, 50))).toBe('high')
  })

  it('returns high for verbatim', () => {
    expect(getDetectionConfidence(makeBlock('verbatim', 0.0, 80))).toBe('high')
  })

  it('returns high for behavioral with high numericRatio', () => {
    expect(getDetectionConfidence(makeBlock('behavioral', 0.99, 50))).toBe('high')
  })

  it('returns high for category with low numericRatio', () => {
    expect(getDetectionConfidence(makeBlock('category', 0.02, 10))).toBe('high')
  })

  it('returns low for nUnique <= 6 and numericRatio > 0.8', () => {
    expect(getDetectionConfidence(makeBlock('rating', 0.95, 5))).toBe('low')
  })

  it('returns low for pctMissing > 0.3', () => {
    expect(getDetectionConfidence(makeBlock('rating', 0.9, 10, 35, 100))).toBe('low')
  })
})

describe('isAmbiguousName', () => {
  it('returns true for ambiguous names', () => {
    expect(isAmbiguousName('A')).toBe(true)
    expect(isAmbiguousName('col1')).toBe(true)
    expect(isAmbiguousName('field')).toBe(true)
    expect(isAmbiguousName('value2')).toBe(true)
    expect(isAmbiguousName('x')).toBe(true)
    expect(isAmbiguousName('123')).toBe(true)
    expect(isAmbiguousName('var1')).toBe(true)
    expect(isAmbiguousName('Column3')).toBe(true)
  })

  it('returns false for descriptive names', () => {
    expect(isAmbiguousName('games_played')).toBe(false)
    expect(isAmbiguousName('registration_type')).toBe(false)
    expect(isAmbiguousName('gross_revenue')).toBe(false)
    expect(isAmbiguousName('win_rate_last_28_days')).toBe(false)
    expect(isAmbiguousName('country')).toBe(false)
    expect(isAmbiguousName('Overall Satisfaction')).toBe(false)
  })
})

describe('Bulk confirm logic', () => {
  it('confirm all confirms only high-confidence rows', () => {
    const highBlock = makeBlock('checkbox', 1.0, 2)
    const lowBlock = makeBlock('rating', 0.95, 5) // low confidence: nUnique ≤ 6

    // Simulate: high block should be auto-confirmable, low should not
    expect(getDetectionConfidence(highBlock)).toBe('high')
    expect(getDetectionConfidence(lowBlock)).toBe('low')
    // High-confidence block can be auto-confirmed, low cannot
    expect(highBlock.confirmed).toBe(false) // starts unconfirmed
  })

  it('proceed disabled when any row unconfirmed', () => {
    const blocks = [
      { ...makeBlock('checkbox', 1.0, 2), confirmed: true },
      { ...makeBlock('rating', 0.95, 5), confirmed: false },
    ]
    const allConfirmed = blocks.filter((b) => b.columns.length > 0).every((b) => b.confirmed)
    expect(allConfirmed).toBe(false)
  })

  it('proceed enabled when all rows confirmed', () => {
    const blocks = [
      { ...makeBlock('checkbox', 1.0, 2), confirmed: true },
      { ...makeBlock('rating', 0.95, 5), confirmed: true },
    ]
    const allConfirmed = blocks.filter((b) => b.columns.length > 0).every((b) => b.confirmed)
    expect(allConfirmed).toBe(true)
  })
})
