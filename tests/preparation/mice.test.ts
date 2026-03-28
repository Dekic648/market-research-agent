/**
 * MICE imputation tests.
 */
import { describe, it, expect } from 'vitest'
import { runMICEImputation } from '../../src/preparation/missingData'
import type { ColumnDefinition } from '../../src/types/dataTypes'

function makeCol(
  id: string, name: string, type: ColumnDefinition['type'],
  values: (number | string | null)[],
  nullMeaning: 'missing' | 'not_asked' | 'not_chosen' = 'missing'
): ColumnDefinition {
  return {
    id, name, type,
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    nullMeaning,
    rawValues: values,
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: [],
    sensitivity: 'anonymous',
    declaredScaleRange: null,
  }
}

describe('runMICEImputation', () => {
  it('returns totalImputed > 0 for a dataset with missing values', () => {
    const cols = [
      makeCol('q1', 'Satisfaction', 'rating', [5, 4, null, 3, 2, null, 4, 5, 3, 4, 5, 4, null, 3, 2, 4, 5, 3, 4, 5]),
      makeCol('q2', 'Trust', 'rating', [4, null, 3, 5, 4, 3, null, 4, 5, 3, 4, 5, 3, null, 4, 5, 3, 4, 5, 4]),
    ]
    const result = runMICEImputation(cols, 20)
    expect(result.totalImputed).toBeGreaterThan(0)
    expect(result.columnsImputed).toBeGreaterThan(0)
    expect(result.method).toBe('mice')
    expect(result.nImputations).toBe(5)
  })

  it('does not impute columns with nullMeaning not_chosen', () => {
    const cols = [
      makeCol('q1', 'Opted In', 'checkbox', [1, null, 1, null, 1, null, 1, null, 1, null], 'not_chosen'),
      makeCol('q2', 'Rating', 'rating', [5, 4, null, 3, 2, 5, 4, 3, 2, 1]),
    ]
    const result = runMICEImputation(cols, 10)
    // q1 should not be imputed — it's not_chosen
    expect(result.imputedColumns.has('q1')).toBe(false)
  })

  it('does not impute columns with nullMeaning not_asked', () => {
    const cols = [
      makeCol('q1', 'Follow-up', 'rating', [4, null, null, null, 3, null, null, 5, null, 2], 'not_asked'),
      makeCol('q2', 'Rating', 'rating', [5, 4, 3, 2, 1, 5, 4, 3, 2, 1]),
    ]
    const result = runMICEImputation(cols, 10)
    expect(result.imputedColumns.has('q1')).toBe(false)
  })

  it('does not impute verbatim columns', () => {
    const cols = [
      makeCol('q1', 'Comment', 'verbatim', ['good', null, 'bad', null, 'ok', null, 'great', null, 'fine', null]),
      makeCol('q2', 'Rating', 'rating', [5, 4, null, 3, 2, 5, 4, 3, 2, 1]),
    ]
    const result = runMICEImputation(cols, 10)
    expect(result.imputedColumns.has('q1')).toBe(false)
  })

  it('imputedValues has the same length as rawValues', () => {
    const n = 30
    const values: (number | null)[] = Array.from({ length: n }, (_, i) => i % 5 === 0 ? null : (i % 5) + 1)
    const cols = [
      makeCol('q1', 'Score', 'rating', values),
      makeCol('q2', 'Quality', 'rating', values.map((v, i) => i % 7 === 0 ? null : (i % 5) + 1)),
    ]
    const result = runMICEImputation(cols, n)
    for (const [, imputed] of result.imputedColumns) {
      expect(imputed.length).toBe(n)
    }
  })

  it('values that were not null are unchanged after imputation', () => {
    const original = [5, 4, null, 3, 2, null, 4, 5, 3, 4, 5, 4, null, 3, 2, 4, 5, 3, 4, 5]
    const cols = [
      makeCol('q1', 'Score', 'rating', original),
      makeCol('q2', 'Other', 'rating', [4, 3, 5, 2, 1, 4, 3, 5, 2, 1, 4, 3, 5, 2, 1, 4, 3, 5, 2, 1]),
    ]
    const result = runMICEImputation(cols, 20)
    const imputed = result.imputedColumns.get('q1')
    if (imputed) {
      for (let i = 0; i < original.length; i++) {
        if (original[i] !== null) {
          expect(imputed[i]).toBe(original[i])
        }
      }
    }
  })

  it('totalImputed correctly counts only null cells', () => {
    const values = [5, null, null, 3, 2, 5, 4, 3, null, 1, 5, 4, 3, 2, 1, 5, 4, 3, 2, 1]
    // 3 nulls in q1
    const cols = [
      makeCol('q1', 'Score', 'rating', values),
      makeCol('q2', 'Other', 'rating', [4, 3, 5, 2, 1, 4, 3, 5, 2, 1, 4, 3, 5, 2, 1, 4, 3, 5, 2, 1]),
    ]
    const result = runMICEImputation(cols, 20)
    // Only q1 has nulls, and it has exactly 3
    expect(result.totalImputed).toBe(3)
  })
})
