/**
 * Median imputation and auto-imputation tests.
 */
import { describe, it, expect } from 'vitest'
import { imputeColumnMedian } from '../../src/preparation/missingData'
import { resolveColumn } from '../../src/engine/resolveColumn'
import type { ColumnDefinition } from '../../src/types/dataTypes'

function makeCol(overrides: Partial<ColumnDefinition> & { rawValues: (number | string | null)[] }): ColumnDefinition {
  return {
    id: 'test', name: 'Test', type: 'behavioral',
    nRows: overrides.rawValues.length,
    nMissing: overrides.rawValues.filter((v) => v === null).length,
    nullMeaning: 'missing',
    fingerprint: null, semanticDetectionCache: null,
    transformStack: [], sensitivity: 'anonymous', declaredScaleRange: null,
    ...overrides,
  }
}

describe('imputeColumnMedian', () => {
  it('replaces nulls with median of non-null values', () => {
    const result = imputeColumnMedian([1, null, 3, null, 5])
    // Median of [1, 3, 5] = 3
    expect(result).toEqual([1, 3, 3, 3, 5])
  })

  it('handles even-length arrays correctly (average of two middle)', () => {
    const result = imputeColumnMedian([1, null, 3, 4])
    // Sorted non-null: [1, 3, 4], median = 3
    expect(result).toEqual([1, 3, 3, 4])
  })

  it('handles right-skewed data — median lower than mean', () => {
    const result = imputeColumnMedian([1, 2, 3, null, 100])
    // Sorted: [1, 2, 3, 100], median = (2+3)/2 = 2.5
    expect(result[3]).toBe(2.5)
    // Mean would be (1+2+3+100)/4 = 26.5 — much higher
  })

  it('returns unchanged array when all values are null', () => {
    const result = imputeColumnMedian([null, null, null])
    expect(result).toEqual([null, null, null])
  })

  it('does not mutate the original array', () => {
    const original: (number | null)[] = [1, null, 3]
    imputeColumnMedian(original)
    expect(original[1]).toBeNull()
  })
})

describe('Auto-imputation in resolveColumn', () => {
  it('applies when nullMeaning=missing, type=behavioral, rate=3%', () => {
    // 100 rows, 3 null = 3% missing rate
    const values: (number | null)[] = Array.from({ length: 100 }, (_, i) => i < 3 ? null : i)
    const col = makeCol({ rawValues: values, type: 'behavioral', nullMeaning: 'missing' })
    const result = resolveColumn(col)
    // Nulls should be replaced with median
    expect(result[0]).not.toBeNull()
    expect(result[1]).not.toBeNull()
    expect(result[2]).not.toBeNull()
  })

  it('does NOT apply when missing rate is 8%', () => {
    const values: (number | null)[] = Array.from({ length: 100 }, (_, i) => i < 8 ? null : i)
    const col = makeCol({ rawValues: values, type: 'behavioral', nullMeaning: 'missing', nMissing: 8 })
    const result = resolveColumn(col)
    // Nulls should remain
    expect(result[0]).toBeNull()
  })

  it('does NOT apply when imputedValues already set', () => {
    const values: (number | null)[] = [null, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    const imputed = [99, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    const col = makeCol({
      rawValues: values, type: 'behavioral', nullMeaning: 'missing',
      imputedValues: imputed, nMissing: 1,
    })
    const result = resolveColumn(col)
    // Should use imputedValues (99), not auto-median
    expect(result[0]).toBe(99)
  })

  it('does NOT apply to not_chosen column', () => {
    const values: (number | null)[] = Array.from({ length: 100 }, (_, i) => i < 3 ? null : 1)
    const col = makeCol({ rawValues: values, type: 'checkbox', nullMeaning: 'not_chosen', nMissing: 3 })
    const result = resolveColumn(col)
    expect(result[0]).toBeNull()
  })

  it('does NOT apply to category type', () => {
    const values: (string | null)[] = Array.from({ length: 100 }, (_, i) => i < 3 ? null : 'A')
    const col = makeCol({ rawValues: values, type: 'category', nullMeaning: 'missing', nMissing: 3 })
    const result = resolveColumn(col)
    expect(result[0]).toBeNull()
  })
})
