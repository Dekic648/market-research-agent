/**
 * Tests for row alignment, straight-line detection, and regression log enrichment.
 */
import { describe, it, expect } from 'vitest'
import {
  checkRowAlignment,
  validateRowAlignment,
  checkStraightLiners,
} from '../src/detection/statisticalChecks'
import { AnalysisRegistry } from '../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../src/plugins/types'

// Register plugins
import '../src/plugins/RegressionPlugin'
import '../src/plugins/DriverPlugin'

// ============================================================
// Fix 1: Row alignment validation
// ============================================================

describe('validateRowAlignment', () => {
  it('returns valid for columns of equal length', () => {
    const result = validateRowAlignment([
      { id: 'a', name: 'A', rawValues: [1, 2, 3] },
      { id: 'b', name: 'B', rawValues: [4, 5, 6] },
    ])
    expect(result.valid).toBe(true)
    expect(result.expectedLength).toBe(3)
    expect(result.violatingColumns).toEqual([])
  })

  it('returns invalid for columns of unequal length', () => {
    const result = validateRowAlignment([
      { id: 'a', name: 'A', rawValues: [1, 2, 3] },
      { id: 'b', name: 'B', rawValues: [4, 5] },
    ])
    expect(result.valid).toBe(false)
    expect(result.violatingColumns).toHaveLength(1)
    expect(result.violatingColumns[0].id).toBe('b')
    expect(result.violatingColumns[0].length).toBe(2)
  })
})

describe('checkRowAlignment', () => {
  it('produces critical flag for unequal column lengths', () => {
    const flag = checkRowAlignment([
      { id: 'a', name: 'A', rawValues: [1, 2, 3] },
      { id: 'b', name: 'B', rawValues: [4, 5] },
    ])
    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('row_alignment_violation')
    expect(flag!.severity).toBe('critical')
  })

  it('returns null for equal column lengths', () => {
    const flag = checkRowAlignment([
      { id: 'a', name: 'A', rawValues: [1, 2, 3] },
      { id: 'b', name: 'B', rawValues: [4, 5, 6] },
    ])
    expect(flag).toBeNull()
  })

  it('nulls in a valid dataset do NOT trigger alignment violation', () => {
    const flag = checkRowAlignment([
      { id: 'a', name: 'A', rawValues: [1, null, 3] },
      { id: 'b', name: 'B', rawValues: [null, 5, null] },
    ])
    expect(flag).toBeNull() // both have length 3 — nulls are valid values
  })
})

// ============================================================
// Fix 2: Straight-line response detection
// ============================================================

describe('checkStraightLiners', () => {
  it('flags matrix block with >10% straight-liners', () => {
    // 20 respondents, 3 straight-line (15%)
    const nRows = 20
    const cols = Array.from({ length: 5 }, (_, c) => ({
      rawValues: Array.from({ length: nRows }, (_, r) => {
        if (r < 3) return 4 // first 3 respondents answer 4 for everything
        return (r + c) % 5 + 1 // rest have varied answers
      }) as (number | string | null)[],
    }))

    const flag = checkStraightLiners(cols, 'matrix')
    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('straight_line_responses')
    expect(flag!.severity).toBe('warning')
    expect((flag!.detail as any).count).toBe(3)
    expect((flag!.detail as any).pct).toBeGreaterThan(0.10)
  })

  it('does NOT flag matrix block with <=10% straight-liners', () => {
    // 20 respondents, 1 straight-liner (5%)
    const nRows = 20
    const cols = Array.from({ length: 5 }, (_, c) => ({
      rawValues: Array.from({ length: nRows }, (_, r) => {
        if (r === 0) return 4 // only 1 straight-liner
        return (r + c) % 5 + 1
      }) as (number | string | null)[],
    }))

    const flag = checkStraightLiners(cols, 'matrix')
    expect(flag).toBeNull()
  })

  it('does NOT flag blocks with fewer than 4 columns', () => {
    const cols = Array.from({ length: 3 }, () => ({
      rawValues: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4] as (number | string | null)[],
    }))
    const flag = checkStraightLiners(cols, 'matrix')
    expect(flag).toBeNull()
  })

  it('excludes nulls from identical-value check', () => {
    // Respondent with [4, null, 4, 4] counts as straight-lining on 3 items
    // But needs >= 4 non-null to count, so [4, null, 4, 4, 4] = 4 non-null = counts
    const nRows = 20
    const cols = Array.from({ length: 5 }, (_, c) => ({
      rawValues: Array.from({ length: nRows }, (_, r) => {
        if (r < 4) {
          // First 4 respondents: 4 for everything except one null
          return c === 1 ? null : 4
        }
        return (r + c) % 5 + 1
      }) as (number | string | null)[],
    }))

    const flag = checkStraightLiners(cols, 'matrix')
    // 4 straight-liners out of 20 = 20% > 10%
    expect(flag).not.toBeNull()
    expect((flag!.detail as any).count).toBe(4)
  })

  it('excludes respondents with only 1 non-null response', () => {
    // Respondent with [4, null, null, null, null] — only 1 answer, not enough
    const nRows = 15
    const cols = Array.from({ length: 5 }, (_, c) => ({
      rawValues: Array.from({ length: nRows }, (_, r) => {
        if (r === 0) return c === 0 ? 4 : null // only 1 non-null
        if (r < 4) return 4 // straight-liners
        return (r + c) % 5 + 1
      }) as (number | string | null)[],
    }))

    const flag = checkStraightLiners(cols, 'matrix')
    // r=0 excluded (1 non-null), r=1-3 are straight-liners
    if (flag) {
      // Should not count r=0
      const detail = flag.detail as any
      expect(detail.count).toBeLessThanOrEqual(3)
    }
  })

  it('only runs on matrix type', () => {
    const cols = Array.from({ length: 5 }, () => ({
      rawValues: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4] as (number | string | null)[],
    }))
    expect(checkStraightLiners(cols, 'rating')).toBeNull()
    expect(checkStraightLiners(cols, 'checkbox')).toBeNull()
  })
})

// ============================================================
// Fix 3: Regression log enrichment
// ============================================================

describe('Regression log enrichment', () => {
  it('RegressionPlugin log entry contains outcome and predictor column IDs', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'outcome_1', name: 'Satisfaction', values: Array.from({ length: 40 }, (_, i) => (i % 5) + 1) },
        { id: 'pred_1', name: 'Quality', values: Array.from({ length: 40 }, (_, i) => (i % 5) + 1) },
        { id: 'pred_2', name: 'Price', values: Array.from({ length: 40 }, (_, i) => ((i + 2) % 5) + 1) },
      ],
      n: 40,
    }

    const plugin = AnalysisRegistry.get('regression')!
    const result = await plugin.run(data)

    const payload = result.logEntry.payload as any
    expect(payload.outcomeColumnId).toBe('outcome_1')
    expect(payload.outcomeColumnName).toBe('Satisfaction')
    expect(payload.predictorColumnIds).toEqual(['pred_1', 'pred_2'])
    expect(payload.predictorColumnNames).toEqual(['Quality', 'Price'])
  })

  it('DriverPlugin log entry contains outcome and predictor column IDs', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'out_1', name: 'Overall SAT', values: Array.from({ length: 50 }, (_, i) => (i % 5) + 1) },
        { id: 'p1', name: 'Attr 1', values: Array.from({ length: 50 }, (_, i) => (i % 5) + 1) },
        { id: 'p2', name: 'Attr 2', values: Array.from({ length: 50 }, (_, i) => ((i + 1) % 5) + 1) },
        { id: 'p3', name: 'Attr 3', values: Array.from({ length: 50 }, (_, i) => ((i + 2) % 5) + 1) },
      ],
      n: 50,
    }

    const plugin = AnalysisRegistry.get('driver_analysis')!
    const result = await plugin.run(data)

    const payload = result.logEntry.payload as any
    expect(payload.outcomeColumnId).toBe('out_1')
    expect(payload.outcomeColumnName).toBe('Overall SAT')
    expect(payload.predictorColumnIds).toEqual(['p1', 'p2', 'p3'])
    expect(payload.predictorColumnNames).toEqual(['Attr 1', 'Attr 2', 'Attr 3'])
  })
})
