/**
 * FindingsStore tests — getOrderedForReport() ordering.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useFindingsStore } from '../../src/stores/findingsStore'
import type { Finding } from '../../src/types/dataTypes'

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: `f_${Math.random().toString(36).slice(2)}`,
    stepId: 'frequency',
    type: 'frequency',
    title: 'Test',
    summary: 'Test finding',
    detail: '{}',
    significant: true,
    pValue: 0.01,
    adjustedPValue: null,
    effectSize: 0.15,
    effectLabel: 'medium',
    theme: null,
    suppressed: false,
    priority: 0,
    createdAt: Date.now(),
    dataVersion: 1,
    dataFingerprint: 'fp',
    ...overrides,
  }
}

beforeEach(() => {
  useFindingsStore.getState().reset()
})

describe('getOrderedForReport', () => {
  it('returns frequency findings before regression findings', () => {
    const store = useFindingsStore.getState()
    // Add regression first, then frequency — order should be reversed in output
    store.add(makeFinding({ id: 'reg1', stepId: 'regression', type: 'regression', effectSize: 0.5 }))
    store.add(makeFinding({ id: 'freq1', stepId: 'frequency', type: 'frequency', effectSize: null }))

    const ordered = useFindingsStore.getState().getOrderedForReport()
    expect(ordered.length).toBe(2)
    expect(ordered[0].stepId).toBe('frequency')
    expect(ordered[1].stepId).toBe('regression')
  })

  it('within same priority tier, higher effect size appears first', () => {
    const store = useFindingsStore.getState()
    store.add(makeFinding({ id: 'corr1', stepId: 'correlation', type: 'correlation', effectSize: 0.3 }))
    store.add(makeFinding({ id: 'corr2', stepId: 'correlation', type: 'correlation', effectSize: 0.8 }))

    const ordered = useFindingsStore.getState().getOrderedForReport()
    expect(ordered.length).toBe(2)
    expect(ordered[0].id).toBe('corr2') // higher effect size
    expect(ordered[1].id).toBe('corr1')
  })

  it('excludes suppressed findings', () => {
    const store = useFindingsStore.getState()
    store.add(makeFinding({ id: 'f1', stepId: 'frequency', suppressed: false }))
    store.add(makeFinding({ id: 'f2', stepId: 'frequency', suppressed: true }))

    const ordered = useFindingsStore.getState().getOrderedForReport()
    expect(ordered.length).toBe(1)
    expect(ordered[0].id).toBe('f1')
  })

  it('sorts across multiple priority tiers correctly', () => {
    const store = useFindingsStore.getState()
    store.add(makeFinding({ id: 'drv', stepId: 'driver_analysis', effectSize: 0.9 }))
    store.add(makeFinding({ id: 'freq', stepId: 'frequency', effectSize: null }))
    store.add(makeFinding({ id: 'sig', stepId: 'kw_significance', effectSize: 0.2 }))
    store.add(makeFinding({ id: 'xtab', stepId: 'crosstab', effectSize: null }))

    const ordered = useFindingsStore.getState().getOrderedForReport()
    const stepIds = ordered.map((f) => f.stepId)
    expect(stepIds).toEqual(['frequency', 'crosstab', 'kw_significance', 'driver_analysis'])
  })

  it('handles findings with null effect size', () => {
    const store = useFindingsStore.getState()
    store.add(makeFinding({ id: 'f1', stepId: 'frequency', effectSize: null }))
    store.add(makeFinding({ id: 'f2', stepId: 'frequency', effectSize: 0.5 }))

    const ordered = useFindingsStore.getState().getOrderedForReport()
    expect(ordered[0].id).toBe('f2') // non-null effect size sorts first
  })
})
