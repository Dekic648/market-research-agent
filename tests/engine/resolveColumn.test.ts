/**
 * resolveColumn tests — verifies every transform type and the stack pipeline.
 *
 * resolveColumn is the ONLY place transformations are applied.
 * rawValues are never accessed directly by analysis code.
 */
import { describe, it, expect } from 'vitest'
import { resolveColumn, resolvePrefixedOrdinalSortKeys } from '../../src/engine/resolveColumn'
import type { ColumnDefinition } from '../../src/types/dataTypes'
import type { TypedTransform } from '../../src/types/transforms'

// Helper: create a minimal ColumnDefinition for testing
function makeColumn(
  rawValues: (number | string | null)[],
  transforms: TypedTransform[] = []
): ColumnDefinition {
  return {
    id: 'test_col',
    name: 'Test',
    type: 'rating',
    nRows: rawValues.length,
    nMissing: rawValues.filter((v) => v === null).length,
    rawValues,
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: transforms,
    sensitivity: 'anonymous',
    declaredScaleRange: null,
  }
}

// Helper: create a base transform with defaults
function makeTransform(
  overrides: Partial<TypedTransform> & Pick<TypedTransform, 'type' | 'params'>
): TypedTransform {
  return {
    id: 'tx_' + Math.random().toString(36).slice(2, 6),
    enabled: true,
    createdAt: Date.now(),
    createdBy: 'user',
    source: 'user',
    ...overrides,
  } as TypedTransform
}

// ============================================================
// No transforms — passthrough
// ============================================================

describe('resolveColumn — passthrough', () => {
  it('returns rawValues when no transforms', () => {
    const col = makeColumn([1, 2, 3, 4, 5])
    const result = resolveColumn(col)
    expect(result).toEqual([1, 2, 3, 4, 5])
  })

  it('returns a copy, not the original array', () => {
    const col = makeColumn([1, 2, 3])
    const result = resolveColumn(col)
    expect(result).not.toBe(col.rawValues)
    expect(result).toEqual(col.rawValues)
  })

  it('preserves nulls', () => {
    const col = makeColumn([1, null, 3, null, 5])
    const result = resolveColumn(col)
    expect(result).toEqual([1, null, 3, null, 5])
  })

  it('preserves strings', () => {
    const col = makeColumn(['a', 'b', null, 'c'])
    const result = resolveColumn(col)
    expect(result).toEqual(['a', 'b', null, 'c'])
  })
})

// ============================================================
// reverseCode
// ============================================================

describe('resolveColumn — reverseCode', () => {
  it('reverses a 1-5 scale', () => {
    const col = makeColumn(
      [1, 2, 3, 4, 5],
      [makeTransform({ type: 'reverseCode', params: { scaleMin: 1, scaleMax: 5 } })]
    )
    const result = resolveColumn(col)
    expect(result).toEqual([5, 4, 3, 2, 1])
  })

  it('reverses a 1-7 scale', () => {
    const col = makeColumn(
      [1, 4, 7],
      [makeTransform({ type: 'reverseCode', params: { scaleMin: 1, scaleMax: 7 } })]
    )
    const result = resolveColumn(col)
    expect(result).toEqual([7, 4, 1])
  })

  it('preserves nulls during reverse', () => {
    const col = makeColumn(
      [1, null, 5],
      [makeTransform({ type: 'reverseCode', params: { scaleMin: 1, scaleMax: 5 } })]
    )
    const result = resolveColumn(col)
    expect(result).toEqual([5, null, 1])
  })

  it('passes through non-numeric strings', () => {
    const col = makeColumn(
      [1, 'N/A', 5],
      [makeTransform({ type: 'reverseCode', params: { scaleMin: 1, scaleMax: 5 } })]
    )
    const result = resolveColumn(col)
    expect(result).toEqual([5, 'N/A', 1])
  })
})

// ============================================================
// labelMap
// ============================================================

describe('resolveColumn — labelMap', () => {
  it('maps numeric codes to labels', () => {
    const col = makeColumn(
      [1, 2, 3],
      [makeTransform({ type: 'labelMap', params: { map: { 1: 'Low', 2: 'Mid', 3: 'High' } } })]
    )
    const result = resolveColumn(col)
    expect(result).toEqual(['Low', 'Mid', 'High'])
  })

  it('passes through unmapped values', () => {
    const col = makeColumn(
      [1, 2, 99],
      [makeTransform({ type: 'labelMap', params: { map: { 1: 'Low', 2: 'High' } } })]
    )
    const result = resolveColumn(col)
    expect(result).toEqual(['Low', 'High', 99])
  })

  it('handles null values', () => {
    const col = makeColumn(
      [1, null, 3],
      [makeTransform({ type: 'labelMap', params: { map: { 1: 'A', 3: 'C' } } })]
    )
    const result = resolveColumn(col)
    expect(result).toEqual(['A', null, 'C'])
  })
})

// ============================================================
// recodeRange
// ============================================================

describe('resolveColumn — recodeRange', () => {
  it('collapses 5-point to 3-point', () => {
    const col = makeColumn(
      [1, 2, 3, 4, 5],
      [
        makeTransform({
          type: 'recodeRange',
          params: {
            rules: [
              { from: [1, 2], to: 1 },
              { from: [3], to: 2 },
              { from: [4, 5], to: 3 },
            ],
          },
        }),
      ]
    )
    const result = resolveColumn(col)
    expect(result).toEqual([1, 1, 2, 3, 3])
  })

  it('passes through values not in any rule', () => {
    const col = makeColumn(
      [1, 2, 99],
      [
        makeTransform({
          type: 'recodeRange',
          params: { rules: [{ from: [1, 2], to: 1 }] },
        }),
      ]
    )
    const result = resolveColumn(col)
    expect(result).toEqual([1, 1, 99])
  })
})

// ============================================================
// logTransform
// ============================================================

describe('resolveColumn — logTransform', () => {
  it('applies natural log with constant', () => {
    const col = makeColumn(
      [0, 1, Math.E - 1],
      [makeTransform({ type: 'logTransform', params: { base: Math.E, constant: 1 } })]
    )
    const result = resolveColumn(col) as number[]
    expect(result[0]).toBeCloseTo(0, 5)       // ln(0 + 1) = 0
    expect(result[1]).toBeCloseTo(0.6931, 3)  // ln(2)
    expect(result[2]).toBeCloseTo(1, 3)       // ln(e) = 1
  })

  it('returns null for values that would be <= 0 after constant', () => {
    const col = makeColumn(
      [-2, -1, 0],
      [makeTransform({ type: 'logTransform', params: { base: Math.E, constant: 1 } })]
    )
    const result = resolveColumn(col)
    expect(result[0]).toBeNull()   // -2 + 1 = -1, log(-1) = undefined
    expect(result[1]).toBeNull()   // -1 + 1 = 0, log(0) = undefined
    expect(result[2]).toBeCloseTo(0, 5)  // 0 + 1 = 1, log(1) = 0
  })
})

// ============================================================
// zScore
// ============================================================

describe('resolveColumn — zScore', () => {
  it('standardizes values', () => {
    const col = makeColumn(
      [10, 20, 30],
      [makeTransform({ type: 'zScore', params: { mean: 20, sd: 10 } })]
    )
    const result = resolveColumn(col) as number[]
    expect(result[0]).toBeCloseTo(-1, 5)
    expect(result[1]).toBeCloseTo(0, 5)
    expect(result[2]).toBeCloseTo(1, 5)
  })

  it('returns unchanged values when sd = 0', () => {
    const col = makeColumn(
      [5, 5, 5],
      [makeTransform({ type: 'zScore', params: { mean: 5, sd: 0 } })]
    )
    const result = resolveColumn(col)
    expect(result).toEqual([5, 5, 5])
  })
})

// ============================================================
// winsorize
// ============================================================

describe('resolveColumn — winsorize', () => {
  it('caps extreme values at bounds', () => {
    const col = makeColumn(
      [1, 5, 10, 50, 100],
      [
        makeTransform({
          type: 'winsorize',
          params: { lowerPct: 5, upperPct: 95, lowerBound: 3, upperBound: 80 },
        }),
      ]
    )
    const result = resolveColumn(col)
    expect(result).toEqual([3, 5, 10, 50, 80])
  })

  it('preserves nulls', () => {
    const col = makeColumn(
      [1, null, 100],
      [
        makeTransform({
          type: 'winsorize',
          params: { lowerPct: 5, upperPct: 95, lowerBound: 3, upperBound: 80 },
        }),
      ]
    )
    const result = resolveColumn(col)
    expect(result).toEqual([3, null, 80])
  })
})

// ============================================================
// Stack behavior
// ============================================================

describe('resolveColumn — stack pipeline', () => {
  it('applies transforms in order', () => {
    // First reverse (1-5 → 5-1), then recode (5→3, 4→3, 3→2, 2→1, 1→1)
    const col = makeColumn(
      [1, 2, 3, 4, 5],
      [
        makeTransform({ type: 'reverseCode', params: { scaleMin: 1, scaleMax: 5 } }),
        makeTransform({
          type: 'recodeRange',
          params: {
            rules: [
              { from: [1, 2], to: 1 },
              { from: [3], to: 2 },
              { from: [4, 5], to: 3 },
            ],
          },
        }),
      ]
    )
    const result = resolveColumn(col)
    // After reverse: [5, 4, 3, 2, 1]
    // After recode: [3, 3, 2, 1, 1]
    expect(result).toEqual([3, 3, 2, 1, 1])
  })

  it('skips disabled transforms', () => {
    const col = makeColumn(
      [1, 2, 3, 4, 5],
      [
        makeTransform({
          type: 'reverseCode',
          params: { scaleMin: 1, scaleMax: 5 },
          enabled: false,
        } as any),
      ]
    )
    const result = resolveColumn(col)
    expect(result).toEqual([1, 2, 3, 4, 5])
  })

  it('stackOverride replaces the column stack', () => {
    const col = makeColumn(
      [1, 2, 3, 4, 5],
      [makeTransform({ type: 'reverseCode', params: { scaleMin: 1, scaleMax: 5 } })]
    )
    // Override with empty stack — should return raw values
    const result = resolveColumn(col, [])
    expect(result).toEqual([1, 2, 3, 4, 5])
  })

  it('stackOverride can apply different transforms', () => {
    const col = makeColumn([10, 20, 30])
    const overrideStack: TypedTransform[] = [
      makeTransform({ type: 'zScore', params: { mean: 20, sd: 10 } }),
    ]
    const result = resolveColumn(col, overrideStack) as number[]
    expect(result[0]).toBeCloseTo(-1, 5)
    expect(result[1]).toBeCloseTo(0, 5)
    expect(result[2]).toBeCloseTo(1, 5)
  })
})

// ============================================================
// rawValues immutability
// ============================================================

describe('resolveColumn — immutability', () => {
  it('never mutates rawValues', () => {
    const raw = [1, 2, 3, 4, 5]
    const rawCopy = [...raw]
    const col = makeColumn(
      raw,
      [makeTransform({ type: 'reverseCode', params: { scaleMin: 1, scaleMax: 5 } })]
    )
    resolveColumn(col)
    expect(col.rawValues).toEqual(rawCopy)
  })

  it('never mutates the transform stack', () => {
    const transforms: TypedTransform[] = [
      makeTransform({ type: 'reverseCode', params: { scaleMin: 1, scaleMax: 5 } }),
    ]
    const stackCopy = JSON.parse(JSON.stringify(transforms))
    const col = makeColumn([1, 2, 3], transforms)
    resolveColumn(col)
    // Transforms should be structurally identical (ignoring id randomness)
    expect(transforms.length).toBe(stackCopy.length)
    expect(transforms[0].type).toBe(stackCopy[0].type)
    expect(transforms[0].enabled).toBe(stackCopy[0].enabled)
  })
})

// ============================================================
// Prefixed ordinal resolution
// ============================================================

describe('resolveColumn — prefixed ordinal', () => {
  function makePrefixedCol(values: (string | null)[]): ColumnDefinition {
    return {
      id: 'seg',
      name: 'Player Type',
      type: 'category',
      categorySubtype: 'prefixed_ordinal',
      subtype: 'prefixed_ordinal',
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

  it('strips prefix for display values', () => {
    const col = makePrefixedCol(['0) NonPayer', '1) ExPayer', '2) Minnow', '3) Dolphin', '4) Whale'])
    const result = resolveColumn(col)
    expect(result).toEqual(['NonPayer', 'ExPayer', 'Minnow', 'Dolphin', 'Whale'])
  })

  it('preserves rawValues unchanged', () => {
    const raw = ['0) NonPayer', '1) ExPayer']
    const col = makePrefixedCol(raw)
    resolveColumn(col)
    expect(col.rawValues).toEqual(['0) NonPayer', '1) ExPayer'])
  })

  it('handles null values', () => {
    const col = makePrefixedCol(['0) NonPayer', null, '2) Minnow'])
    const result = resolveColumn(col)
    expect(result).toEqual(['NonPayer', null, 'Minnow'])
  })

  it('passes through values without prefix pattern', () => {
    const col = makePrefixedCol(['0) NonPayer', 'Unknown', '2) Minnow'])
    const result = resolveColumn(col)
    expect(result).toEqual(['NonPayer', 'Unknown', 'Minnow'])
  })

  it('does NOT strip prefix for non-prefixed_ordinal columns', () => {
    const col = makeColumn(['0) NonPayer', '1) ExPayer', '2) Minnow'])
    // Default makeColumn has no categorySubtype
    const result = resolveColumn(col)
    expect(result).toEqual(['0) NonPayer', '1) ExPayer', '2) Minnow'])
  })
})

describe('resolvePrefixedOrdinalSortKeys', () => {
  function makePrefixedCol(values: (string | null)[]): ColumnDefinition {
    return {
      id: 'seg',
      name: 'Player Type',
      type: 'category',
      categorySubtype: 'prefixed_ordinal',
      subtype: 'prefixed_ordinal',
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

  it('extracts numeric sort keys', () => {
    const col = makePrefixedCol(['0) NonPayer', '1) ExPayer', '2) Minnow', '3) Dolphin', '4) Whale'])
    const keys = resolvePrefixedOrdinalSortKeys(col)
    expect(keys).toEqual([0, 1, 2, 3, 4])
  })

  it('handles double-digit prefixes correctly', () => {
    const col = makePrefixedCol([
      '1) First', '2) Second', '3) Third', '10) Tenth', '11) Eleventh', '20) Twentieth',
    ])
    const keys = resolvePrefixedOrdinalSortKeys(col)
    expect(keys).toEqual([1, 2, 3, 10, 11, 20])

    // Verify sort order: 10 sorts AFTER 2, not before
    const pairs = col.rawValues.map((v, i) => ({ label: v, sortKey: keys[i] }))
    const sorted = [...pairs].sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0))
    expect(sorted[0].label).toBe('1) First')
    expect(sorted[1].label).toBe('2) Second')
    expect(sorted[2].label).toBe('3) Third')
    expect(sorted[3].label).toBe('10) Tenth')
    expect(sorted[4].label).toBe('11) Eleventh')
    expect(sorted[5].label).toBe('20) Twentieth')
  })

  it('handles null values', () => {
    const col = makePrefixedCol(['0) A', null, '2) C'])
    const keys = resolvePrefixedOrdinalSortKeys(col)
    expect(keys).toEqual([0, null, 2])
  })

  it('returns null for values without prefix', () => {
    const col = makePrefixedCol(['0) A', 'NoPrefix', '2) C'])
    const keys = resolvePrefixedOrdinalSortKeys(col)
    expect(keys).toEqual([0, null, 2])
  })
})
