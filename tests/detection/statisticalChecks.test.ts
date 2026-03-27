/**
 * Statistical detection checks — tests for all 6 checks.
 * No API calls, deterministic, < 100ms per column.
 */
import { describe, it, expect } from 'vitest'
import {
  checkReverseCoded,
  checkMergedHeaders,
  checkPossibleComputed,
  checkTimestampColumn,
  checkMultiAssignedCodes,
  checkCollapsedCategories,
  runStatisticalChecks,
} from '../../src/detection/statisticalChecks'
import type { CheckInput } from '../../src/detection/types'

// ============================================================
// 1. Reverse-coded detection
// ============================================================

describe('checkReverseCoded', () => {
  it('flags a reverse-coded item', () => {
    // Q1-Q3 correlate positively, Q4 is reversed
    const q1 = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
    const q2 = [1, 2, 3, 4, 5, 2, 3, 3, 4, 5, 1, 2, 4, 4, 5]
    const q3 = [2, 2, 3, 4, 5, 1, 2, 3, 5, 5, 1, 3, 3, 4, 5]
    const q4 = [5, 4, 3, 2, 1, 5, 4, 3, 2, 1, 5, 4, 3, 2, 1] // reversed

    const flag = checkReverseCoded({
      columnId: 'q4',
      columnName: 'Q4',
      values: q4,
      peerColumns: [
        { columnId: 'q1', values: q1 },
        { columnId: 'q2', values: q2 },
        { columnId: 'q3', values: q3 },
      ],
    })

    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('reverse_coded')
    expect(flag!.severity).toBe('warning')
    expect(flag!.confidence).toBeGreaterThan(0.5)
  })

  it('does not flag a non-reversed item', () => {
    const q1 = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
    const q2 = [1, 2, 3, 4, 5, 2, 3, 3, 4, 5]
    const q3 = [2, 2, 3, 4, 5, 1, 2, 3, 5, 5]

    const flag = checkReverseCoded({
      columnId: 'q1',
      columnName: 'Q1',
      values: q1,
      peerColumns: [
        { columnId: 'q2', values: q2 },
        { columnId: 'q3', values: q3 },
      ],
    })

    expect(flag).toBeNull()
  })

  it('returns null with no peer columns', () => {
    const flag = checkReverseCoded({
      columnId: 'q1',
      columnName: 'Q1',
      values: [1, 2, 3, 4, 5],
    })
    expect(flag).toBeNull()
  })
})

// ============================================================
// 2. Merged header detection
// ============================================================

describe('checkMergedHeaders', () => {
  it('flags a question-text first value followed by numeric data', () => {
    const flag = checkMergedHeaders({
      columnId: 'col_0',
      columnName: 'Col 0',
      values: [
        'How satisfied were you with the overall experience?',
        4, 5, 3, 2, 5, 4, 3, 5, 4, 5,
      ],
    })

    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('merged_header')
    expect(flag!.severity).toBe('critical')
  })

  it('does not flag when first value is numeric', () => {
    const flag = checkMergedHeaders({
      columnId: 'col_0',
      columnName: 'Col 0',
      values: [4, 5, 3, 2, 5, 4, 3, 5, 4, 5],
    })
    expect(flag).toBeNull()
  })

  it('does not flag when first value is short', () => {
    const flag = checkMergedHeaders({
      columnId: 'col_0',
      columnName: 'Col 0',
      values: ['Q1', 4, 5, 3, 2, 5],
    })
    expect(flag).toBeNull()
  })

  it('does not flag when rest of column is text', () => {
    const flag = checkMergedHeaders({
      columnId: 'col_0',
      columnName: 'Col 0',
      values: [
        'How satisfied were you with the overall experience?',
        'Very satisfied',
        'Somewhat satisfied',
        'Neutral',
        'Dissatisfied',
      ],
    })
    expect(flag).toBeNull()
  })
})

// ============================================================
// 3. Possible computed column detection
// ============================================================

describe('checkPossibleComputed', () => {
  it('flags a mean of other columns', () => {
    const q1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const q2 = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]
    const sat_mean = q1.map((v, i) => (v + q2[i]) / 2)

    const flag = checkPossibleComputed({
      columnId: 'sat_mean',
      columnName: 'SAT_MEAN',
      values: sat_mean,
      allColumns: [
        { columnId: 'q1', values: q1 },
        { columnId: 'q2', values: q2 },
        { columnId: 'sat_mean', values: sat_mean },
      ],
    })

    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('possible_computed')
    expect(flag!.severity).toBe('critical')
  })

  it('does not flag an independent column', () => {
    const q1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const q2 = [5, 3, 8, 2, 9, 1, 7, 4, 6, 10, 3, 8]
    const q3 = [2, 7, 1, 9, 4, 8, 3, 6, 5, 11, 2, 7]

    const flag = checkPossibleComputed({
      columnId: 'q3',
      columnName: 'Q3',
      values: q3,
      allColumns: [
        { columnId: 'q1', values: q1 },
        { columnId: 'q2', values: q2 },
        { columnId: 'q3', values: q3 },
      ],
    })

    expect(flag).toBeNull()
  })
})

// ============================================================
// 4. Timestamp column detection
// ============================================================

describe('checkTimestampColumn', () => {
  it('flags ISO date column', () => {
    const flag = checkTimestampColumn({
      columnId: 'date',
      columnName: 'Date',
      values: ['2024-01-15', '2024-02-20', '2024-03-10', '2024-04-05', '2024-05-12'],
    })

    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('timestamp_column')
  })

  it('flags US date format', () => {
    const flag = checkTimestampColumn({
      columnId: 'date',
      columnName: 'Date',
      values: ['01/15/2024', '02/20/2024', '03/10/2024', '04/05/2024'],
    })
    expect(flag).not.toBeNull()
  })

  it('flags datetime format', () => {
    const flag = checkTimestampColumn({
      columnId: 'ts',
      columnName: 'Timestamp',
      values: ['2024-01-15T10:30:00', '2024-02-20T14:15:00', '2024-03-10T09:00:00'],
    })
    expect(flag).not.toBeNull()
  })

  it('flags month-name dates', () => {
    const flag = checkTimestampColumn({
      columnId: 'date',
      columnName: 'Date',
      values: ['Jan 15, 2024', 'Feb 20, 2024', 'Mar 10, 2024'],
    })
    expect(flag).not.toBeNull()
  })

  it('does not flag numeric columns', () => {
    const flag = checkTimestampColumn({
      columnId: 'score',
      columnName: 'Score',
      values: [1, 2, 3, 4, 5],
    })
    expect(flag).toBeNull()
  })

  it('does not flag text columns', () => {
    const flag = checkTimestampColumn({
      columnId: 'name',
      columnName: 'Name',
      values: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'],
    })
    expect(flag).toBeNull()
  })
})

// ============================================================
// 5. Multi-assigned codes detection
// ============================================================

describe('checkMultiAssignedCodes', () => {
  it('flags pipe-separated codes', () => {
    const flag = checkMultiAssignedCodes({
      columnId: 'themes',
      columnName: 'Themes',
      values: ['price|quality', 'service', 'price|delivery|service', 'quality'],
    })

    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('multi_assigned_codes')
    expect(flag!.detail.separator).toBe('|')
  })

  it('flags comma-separated numeric codes', () => {
    const flag = checkMultiAssignedCodes({
      columnId: 'codes',
      columnName: 'Codes',
      values: ['1,3', '2', '1,2,4', '3,5', '1'],
    })

    expect(flag).not.toBeNull()
    expect(flag!.detail.separator).toBe(',')
  })

  it('does not flag normal single values', () => {
    const flag = checkMultiAssignedCodes({
      columnId: 'q1',
      columnName: 'Q1',
      values: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
    })
    expect(flag).toBeNull()
  })

  it('does not flag regular text', () => {
    const flag = checkMultiAssignedCodes({
      columnId: 'comment',
      columnName: 'Comment',
      values: ['Great product', 'Not bad', 'Could improve', 'Love it'],
    })
    expect(flag).toBeNull()
  })
})

// ============================================================
// 6. Collapsed categories detection
// ============================================================

describe('checkCollapsedCategories', () => {
  it('flags when fewer unique values than scale range', () => {
    const flag = checkCollapsedCategories({
      columnId: 'q1',
      columnName: 'Q1',
      values: [1, 3, 5, 1, 3, 5, 1, 3, 5, 1],
      declaredScaleRange: [1, 5],
    })

    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('collapsed_categories')
    expect(flag!.detail.expectedPoints).toBe(5)
    expect(flag!.detail.actualUnique).toBe(3)
  })

  it('does not flag when all scale points present', () => {
    const flag = checkCollapsedCategories({
      columnId: 'q1',
      columnName: 'Q1',
      values: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
      declaredScaleRange: [1, 5],
    })
    expect(flag).toBeNull()
  })

  it('returns null without declared scale range', () => {
    const flag = checkCollapsedCategories({
      columnId: 'q1',
      columnName: 'Q1',
      values: [1, 3, 5],
    })
    expect(flag).toBeNull()
  })
})

// ============================================================
// Runner — all checks combined
// ============================================================

describe('runStatisticalChecks', () => {
  it('returns empty array for clean numeric column', () => {
    const flags = runStatisticalChecks({
      columnId: 'q1',
      columnName: 'Q1',
      values: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
    })
    expect(flags).toEqual([])
  })

  it('returns multiple flags when applicable', () => {
    // Timestamp column with multi-assigned codes should trigger timestamp but not multi-assigned
    // Create a column that triggers merged header
    const flags = runStatisticalChecks({
      columnId: 'col_0',
      columnName: 'Col 0',
      values: [
        'How satisfied were you with the overall quality of service?',
        4, 5, 3, 2, 5, 4, 3, 5, 4, 5,
      ],
    })
    expect(flags.length).toBeGreaterThan(0)
    expect(flags.some((f) => f.type === 'merged_header')).toBe(true)
  })

  it('runs in under 100ms for a column of 1000 values', () => {
    const values = Array.from({ length: 1000 }, (_, i) => (i % 5) + 1)
    const peers = [
      { columnId: 'p1', values: Array.from({ length: 1000 }, (_, i) => (i % 5) + 1) },
      { columnId: 'p2', values: Array.from({ length: 1000 }, (_, i) => ((i + 1) % 5) + 1) },
      { columnId: 'p3', values: Array.from({ length: 1000 }, (_, i) => ((i + 2) % 5) + 1) },
    ]

    const start = performance.now()
    runStatisticalChecks({
      columnId: 'q1',
      columnName: 'Q1',
      values,
      peerColumns: peers,
      allColumns: [{ columnId: 'q1', values }, ...peers],
    })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(100)
  })
})
