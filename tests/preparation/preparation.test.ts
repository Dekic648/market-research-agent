/**
 * Data Preparation Layer tests.
 */
import { describe, it, expect } from 'vitest'
import { computeMissingDiagnostics, littlesMCARTest, applyMissingStrategy } from '../../src/preparation/missingData'
import { computeVariable, parseFormula } from '../../src/preparation/computeVariable'
import { computePrepState } from '../../src/preparation/prepState'
import type { ColumnDefinition } from '../../src/types/dataTypes'

function makeCol(id: string, name: string, values: (number | string | null)[]): ColumnDefinition {
  return {
    id, name, type: 'rating',
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    rawValues: values, fingerprint: null, semanticDetectionCache: null,
    transformStack: [], sensitivity: 'anonymous', declaredScaleRange: null,
  }
}

describe('computeMissingDiagnostics', () => {
  it('computes missing counts and percentages', () => {
    const cols = [
      makeCol('q1', 'Q1', [1, 2, null, 4, null]),
      makeCol('q2', 'Q2', [1, 2, 3, 4, 5]),
    ]
    const result = computeMissingDiagnostics(cols)
    expect(result.totalMissing).toBe(2)
    expect(result.totalCells).toBe(10)
    expect(result.pctMissing).toBeCloseTo(20, 0)
    expect(result.perColumn[0].nMissing).toBe(2)
    expect(result.perColumn[0].pctMissing).toBeCloseTo(40, 0)
    expect(result.perColumn[1].nMissing).toBe(0)
  })

  it('identifies variables above 20% missing', () => {
    const cols = [
      makeCol('q1', 'Q1', [null, null, null, 4, 5]),
      makeCol('q2', 'Q2', [1, 2, 3, 4, 5]),
    ]
    const result = computeMissingDiagnostics(cols)
    expect(result.variablesAbove20pct).toContain('q1')
    expect(result.variablesAbove20pct).not.toContain('q2')
  })
})

describe('littlesMCARTest', () => {
  it('returns MCAR for complete data', () => {
    const cols = [
      makeCol('q1', 'Q1', [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]),
      makeCol('q2', 'Q2', [2, 3, 4, 5, 1, 2, 3, 4, 5, 1]),
    ]
    const result = littlesMCARTest(cols)
    expect(result.interpretation).toBe('MCAR')
  })

  it('returns insufficient_data for tiny datasets', () => {
    const cols = [makeCol('q1', 'Q1', [1, 2, 3])]
    const result = littlesMCARTest(cols)
    expect(result.interpretation).toBe('insufficient_data')
  })
})

describe('applyMissingStrategy', () => {
  it('listwise keeps nulls as-is', () => {
    const result = applyMissingStrategy([1, null, 3, null, 5], 'listwise')
    expect(result).toEqual([1, null, 3, null, 5])
  })

  it('pairwise keeps nulls as-is', () => {
    const result = applyMissingStrategy([1, null, 3], 'pairwise')
    expect(result).toEqual([1, null, 3])
  })

  it('mean_imputation replaces nulls with mean', () => {
    const result = applyMissingStrategy([1, null, 3, null, 5], 'mean_imputation')
    expect(result).toEqual([1, 3, 3, 3, 5])
  })

  it('returns a copy, not mutating original', () => {
    const original = [1, null, 3]
    applyMissingStrategy(original, 'mean_imputation')
    expect(original[1]).toBeNull()
  })
})

describe('computeVariable', () => {
  it('computes MEAN across columns', () => {
    const result = computeVariable(
      [{ values: [2, 4, 6] }, { values: [4, 6, 8] }],
      'mean'
    )
    expect(result).toEqual([3, 5, 7])
  })

  it('computes SUM', () => {
    const result = computeVariable(
      [{ values: [1, 2, 3] }, { values: [10, 20, 30] }],
      'sum'
    )
    expect(result).toEqual([11, 22, 33])
  })

  it('handles null values in source', () => {
    const result = computeVariable(
      [{ values: [1, null, 3] }, { values: [10, 20, null] }],
      'mean'
    )
    expect(result[0]).toBe(5.5)
    expect(result[1]).toBe(20)
    expect(result[2]).toBe(3)
  })

  it('returns null for rows where all sources are null', () => {
    const result = computeVariable(
      [{ values: [null, 2] }, { values: [null, 4] }],
      'sum'
    )
    expect(result[0]).toBeNull()
    expect(result[1]).toBe(6)
  })
})

describe('parseFormula', () => {
  it('parses MEAN(Q1, Q2, Q3)', () => {
    const result = parseFormula('MEAN(Q1, Q2, Q3)')
    expect(result).toEqual({ operation: 'mean', columnNames: ['Q1', 'Q2', 'Q3'] })
  })

  it('parses SUM(Q1, Q2_r)', () => {
    const result = parseFormula('SUM(Q1, Q2_r)')
    expect(result).toEqual({ operation: 'sum', columnNames: ['Q1', 'Q2_r'] })
  })

  it('returns null for invalid formula', () => {
    expect(parseFormula('Q1 + Q2')).toBeNull()
    expect(parseFormula('')).toBeNull()
  })
})

describe('computePrepState', () => {
  it('readyToAnalyze is false without declared strategy', () => {
    const cols = [makeCol('q1', 'Q1', [1, 2, 3])]
    const state = computePrepState(cols, null, [])
    expect(state.readyToAnalyze).toBe(false)
    expect(state.missingStrategy).toBeNull()
  })

  it('readyToAnalyze is true with declared strategy', () => {
    const cols = [makeCol('q1', 'Q1', [1, 2, 3])]
    const state = computePrepState(cols, 'listwise', [])
    expect(state.readyToAnalyze).toBe(true)
  })
})
