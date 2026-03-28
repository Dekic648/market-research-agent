/**
 * Row filter tests — filter expressions applied to column values.
 */
import { describe, it, expect } from 'vitest'
import { applyRowFilter } from '../../src/engine/rowFilter'
import type { ColumnDefinition } from '../../src/types/dataTypes'

function makeCol(id: string, name: string, type: ColumnDefinition['type'], values: (number | string | null)[]): ColumnDefinition {
  return {
    id, name, type,
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    rawValues: values,
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: [],
    sensitivity: 'anonymous',
    declaredScaleRange: null,
  }
}

describe('applyRowFilter', () => {
  it('equals filter on categorical column returns correct rows', () => {
    const col = makeCol('seg', 'Region', 'category', ['North', 'South', 'North', 'East', 'South'])
    const indices = applyRowFilter([col], { columnId: 'seg', operator: 'equals', value: 'North' })
    expect(indices).toEqual([0, 2])
  })

  it('not_equals filter works', () => {
    const col = makeCol('seg', 'Region', 'category', ['A', 'B', 'A', 'C'])
    const indices = applyRowFilter([col], { columnId: 'seg', operator: 'not_equals', value: 'A' })
    expect(indices).toEqual([1, 3])
  })

  it('greater_than filter on numeric column returns correct rows', () => {
    const col = makeCol('q1', 'Score', 'rating', [1, 2, 3, 4, 5])
    const indices = applyRowFilter([col], { columnId: 'q1', operator: 'greater_than', value: '3' })
    expect(indices).toEqual([3, 4])
  })

  it('less_than filter on numeric column returns correct rows', () => {
    const col = makeCol('q1', 'Score', 'rating', [10, 20, 30, 40, 50])
    const indices = applyRowFilter([col], { columnId: 'q1', operator: 'less_than', value: '25' })
    expect(indices).toEqual([0, 1])
  })

  it('contains filter works case-insensitively', () => {
    const col = makeCol('q1', 'Comment', 'verbatim', ['Great product', 'Bad service', 'Great value', 'OK'])
    const indices = applyRowFilter([col], { columnId: 'q1', operator: 'contains', value: 'great' })
    expect(indices).toEqual([0, 2])
  })

  it('empty filter returns all rows', () => {
    const col = makeCol('q1', 'Score', 'rating', [1, 2, 3, 4, 5])
    const indices = applyRowFilter([col], null)
    expect(indices).toEqual([0, 1, 2, 3, 4])
  })

  it('nulls do not match any operator', () => {
    const col = makeCol('q1', 'Score', 'rating', [1, null, 3, null, 5])
    const equalsIndices = applyRowFilter([col], { columnId: 'q1', operator: 'equals', value: '1' })
    expect(equalsIndices).toEqual([0])

    const gtIndices = applyRowFilter([col], { columnId: 'q1', operator: 'greater_than', value: '0' })
    expect(gtIndices).toEqual([0, 2, 4]) // nulls skipped
  })

  it('filter on nonexistent column returns all rows', () => {
    const col = makeCol('q1', 'Score', 'rating', [1, 2, 3])
    const indices = applyRowFilter([col], { columnId: 'nonexistent', operator: 'equals', value: '1' })
    expect(indices).toEqual([0, 1, 2])
  })

  it('greater_than with non-numeric values returns nothing', () => {
    const col = makeCol('q1', 'Name', 'category', ['Alice', 'Bob', 'Carol'])
    const indices = applyRowFilter([col], { columnId: 'q1', operator: 'greater_than', value: '5' })
    expect(indices).toEqual([])
  })
})
