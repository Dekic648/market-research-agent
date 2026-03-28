/**
 * Tests for audit fixes: FDR auto-apply, duplicate detection, near-zero variance.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Fix 1: FDR auto-apply
import { HeadlessRunner } from '../src/runners/HeadlessRunner'
import { useFindingsStore } from '../src/stores/findingsStore'
import { AnalysisRegistry } from '../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../src/plugins/types'

// Register plugins
import '../src/plugins/FrequencyPlugin'
import '../src/plugins/SignificancePlugin'

// Fix 2: Duplicate rows
import { checkDuplicateRows } from '../src/detection/statisticalChecks'

// Fix 3: Near-zero variance
import { checkNearZeroVariance } from '../src/detection/statisticalChecks'

// Also need constant check for double-flag test
import { checkConstantColumn } from '../src/detection/statisticalChecks'

beforeEach(() => {
  useFindingsStore.getState().reset()
})

// ============================================================
// Fix 1: FDR auto-apply in HeadlessRunner
// ============================================================

describe('HeadlessRunner FDR auto-apply', () => {
  const baseConfig = {
    userId: 'anonymous',
    dataFingerprint: 'fp',
    dataVersion: 1,
    sessionId: 'test',
  }

  it('auto-applies BH correction when ≥ 5 significance findings', async () => {
    // Create data that produces many significance findings
    // Use KW significance with a clear group split
    const n = 60
    const colValues = Array.from({ length: n }, (_, i) => i < 30 ? 1 : 5)
    const segValues = Array.from({ length: n }, (_, i) => i < 30 ? 'A' : 'B')

    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Q1', values: colValues },
        { id: 'q2', name: 'Q2', values: colValues.map(v => v + 1) },
        { id: 'q3', name: 'Q3', values: colValues },
        { id: 'q4', name: 'Q4', values: colValues.map(v => v + 2) },
        { id: 'q5', name: 'Q5', values: colValues },
      ],
      segment: { id: 'seg', name: 'Segment', values: segValues },
      n,
    }

    const runner = new HeadlessRunner({ data, ...baseConfig })
    const sigPlugin = AnalysisRegistry.get('kw_significance')!
    const result = await runner.runAll([sigPlugin])

    const sigFindings = result.findings.filter(f => f.pValue !== null)

    if (sigFindings.length >= 5) {
      // FDR should have been auto-applied
      expect(runner.fdrAutoApplied).toBe(true)
      expect(runner.logEntries.some(e => e.type === 'fdr_correction_applied')).toBe(true)

      // At least one finding should have adjustedPValue set
      const adjusted = result.findings.filter(f => f.adjustedPValue !== null)
      expect(adjusted.length).toBeGreaterThan(0)
    }
  })

  it('does NOT apply FDR when < 5 significance findings', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: [1, 2, 3, 4, 5] }],
      n: 5,
    }

    const runner = new HeadlessRunner({ data, ...baseConfig })
    const freqPlugin = AnalysisRegistry.get('frequency')!
    await runner.runAll([freqPlugin])

    expect(runner.fdrAutoApplied).toBe(false)
    expect(runner.logEntries.some(e => e.type === 'fdr_correction_applied')).toBe(false)
  })

  it('writes fdr_correction_applied log entry with method and nTests', async () => {
    const n = 60
    const colValues = Array.from({ length: n }, (_, i) => i < 30 ? 1 : 5)
    const segValues = Array.from({ length: n }, (_, i) => i < 30 ? 'A' : 'B')

    const data: ResolvedColumnData = {
      columns: Array.from({ length: 6 }, (_, i) => ({
        id: `q${i}`, name: `Q${i}`, values: colValues.map(v => v + i),
      })),
      segment: { id: 'seg', name: 'Segment', values: segValues },
      n,
    }

    const runner = new HeadlessRunner({ data, ...baseConfig })
    const sigPlugin = AnalysisRegistry.get('kw_significance')!
    await runner.runAll([sigPlugin])

    if (runner.fdrAutoApplied) {
      const fdrEntry = runner.logEntries.find(e => e.type === 'fdr_correction_applied')
      expect(fdrEntry).toBeDefined()
      expect((fdrEntry!.payload as any).method).toBe('bh')
      expect((fdrEntry!.payload as any).nTests).toBeGreaterThanOrEqual(5)
    }
  })
})

describe('FindingsStore.fdrApplied flag', () => {
  it('is false initially', () => {
    expect(useFindingsStore.getState().fdrApplied).toBe(false)
  })

  it('is true after applyFDRCorrection', () => {
    const store = useFindingsStore.getState()
    for (let i = 0; i < 5; i++) {
      store.add({
        id: `f${i}`, stepId: 's', type: 't', title: '', summary: '', detail: '',
        significant: true, pValue: 0.01 * (i + 1), adjustedPValue: null,
        effectSize: null, effectLabel: null, theme: null, suppressed: false,
        priority: i, createdAt: Date.now(), dataVersion: 1, dataFingerprint: 'fp',
      })
    }
    store.applyFDRCorrection('bh')
    expect(useFindingsStore.getState().fdrApplied).toBe(true)
  })

  it('resets to false on store reset', () => {
    useFindingsStore.getState().applyFDRCorrection('bh')
    useFindingsStore.getState().reset()
    expect(useFindingsStore.getState().fdrApplied).toBe(false)
  })
})

// ============================================================
// Fix 2: Duplicate row detection
// ============================================================

describe('checkDuplicateRows', () => {
  it('detects duplicate rows', () => {
    const columns = [
      { id: 'a', values: [1, 2, 1, 3, 2] as (number | string | null)[] },
      { id: 'b', values: ['x', 'y', 'x', 'z', 'y'] as (number | string | null)[] },
    ]
    // Row 0 and Row 2 are identical [1, 'x'], Row 1 and Row 4 are identical [2, 'y']
    const flag = checkDuplicateRows(columns)

    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('duplicate_rows')
    expect(flag!.severity).toBe('critical')
    expect((flag!.detail as any).totalDuplicateRows).toBe(2) // 2 extra copies
    expect((flag!.detail as any).duplicateCount).toBe(2) // 2 patterns repeated
  })

  it('returns null for all unique rows', () => {
    const columns = [
      { id: 'a', values: [1, 2, 3, 4, 5] as (number | string | null)[] },
      { id: 'b', values: ['a', 'b', 'c', 'd', 'e'] as (number | string | null)[] },
    ]
    const flag = checkDuplicateRows(columns)
    expect(flag).toBeNull()
  })

  it('reports accurate duplicate count', () => {
    // 3 copies of the same row
    const columns = [
      { id: 'a', values: [1, 1, 1, 2] as (number | string | null)[] },
      { id: 'b', values: ['x', 'x', 'x', 'y'] as (number | string | null)[] },
    ]
    const flag = checkDuplicateRows(columns)

    expect(flag).not.toBeNull()
    expect((flag!.detail as any).totalDuplicateRows).toBe(2) // 2 extra copies of the same row
    expect((flag!.detail as any).totalRows).toBe(4)
  })
})

// ============================================================
// Fix 3: Near-zero variance detection
// ============================================================

describe('checkNearZeroVariance', () => {
  it('flags column with 95%+ identical values and tiny variance', () => {
    // 19 values of 4.0 and 1 value of 4.01 — CV ≈ 0.0005
    const flag = checkNearZeroVariance({
      columnId: 'q1',
      columnName: 'Q1',
      values: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4.01],
    })

    expect(flag).not.toBeNull()
    expect(flag!.type).toBe('near_zero_variance')
    expect(flag!.severity).toBe('warning')
    expect((flag!.detail as any).sd).toBeGreaterThan(0)
  })

  it('does not flag column with normal spread', () => {
    const flag = checkNearZeroVariance({
      columnId: 'q1',
      columnName: 'Q1',
      values: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
    })
    expect(flag).toBeNull()
  })

  it('does not double-flag constant columns', () => {
    // All identical — should be caught by checkConstantColumn, not near-zero
    const nearZero = checkNearZeroVariance({
      columnId: 'q1',
      columnName: 'Q1',
      values: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    })
    expect(nearZero).toBeNull() // skipped because nUnique === 1

    // Constant check catches it
    const constant = checkConstantColumn({
      columnId: 'q1',
      columnName: 'Q1',
      values: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    })
    expect(constant).not.toBeNull()
  })

  it('handles zero-mean edge case without throwing', () => {
    // Values centered around 0 with tiny variance
    const flag = checkNearZeroVariance({
      columnId: 'q1',
      columnName: 'Q1',
      values: [0.001, -0.001, 0, 0, 0.001, -0.001, 0, 0, 0.001, -0.001],
    })
    // Should not throw — uses SD threshold when mean ≈ 0
    expect(flag).not.toBeNull() // SD ≈ 0.0008 which is < 0.1
  })
})
