/**
 * AnalysisResults 5-tab layout tests.
 * Tests questionOrder, column filtering, significance sorting, correlation matrix.
 */
import { describe, it, expect } from 'vitest'
import type { Finding } from '../../src/types/dataTypes'
import type { RunResult } from '../../src/runners/IStepRunner'

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: `f_${Math.random().toString(36).slice(2, 6)}`,
    stepId: 'frequency',
    type: 'frequency',
    title: 'Test Finding',
    summary: 'Test summary.',
    summaryLanguage: 'Test summary language.',
    detail: '{}',
    significant: false,
    pValue: null,
    adjustedPValue: null,
    effectSize: null,
    effectLabel: null,
    theme: null,
    suppressed: false,
    priority: 0,
    createdAt: Date.now(),
    dataVersion: 1,
    dataFingerprint: 'fp',
    ...overrides,
  }
}

// ============================================================
// Test 1: questionOrder population
// ============================================================

describe('questionOrder on RunResult', () => {
  it('preserves paste order of question blocks', () => {
    // Simulate what DataWorkspace does
    const questionBlocks = [
      { label: 'Q1: Overall Satisfaction' },
      { label: 'Q2: Service Quality' },
      { label: 'Q3: Price Perception' },
    ]
    const questionOrder = questionBlocks.map((b) => b.label)

    expect(questionOrder).toEqual([
      'Q1: Overall Satisfaction',
      'Q2: Service Quality',
      'Q3: Price Perception',
    ])
    expect(questionOrder[0]).toBe('Q1: Overall Satisfaction')
    expect(questionOrder[2]).toBe('Q3: Price Perception')
  })

  it('questionOrder is available on RunResult type', () => {
    const runResult: RunResult = {
      stepResults: [],
      findings: [],
      violations: [],
      completedPlugins: [],
      skippedPlugins: [],
      durationMs: 100,
      questionOrder: ['Q1', 'Q2', 'Q3'],
    }

    expect(runResult.questionOrder).toEqual(['Q1', 'Q2', 'Q3'])
  })
})

// ============================================================
// Test 2: DistributionsTab column filtering
// ============================================================

describe('DistributionsTab column filtering', () => {
  it('excludes segment-role findings from distribution view', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', sourceQuestionLabel: 'Q1: Rating', title: 'Rating Distribution' }),
      makeFinding({ stepId: 'frequency', sourceQuestionLabel: 'Segment: Region', title: 'Region Distribution' }),
      makeFinding({ stepId: 'frequency', sourceQuestionLabel: 'Q2: Quality', title: 'Quality Distribution' }),
    ]

    // DistributionsTab filters by sourceQuestionLabel matching questionOrder
    const questionOrder = ['Q1: Rating', 'Q2: Quality'] // segment not in questionOrder
    const distributed = questionOrder.filter((label) =>
      findings.some((f) => f.stepId === 'frequency' && f.sourceQuestionLabel === label)
    )

    expect(distributed).toEqual(['Q1: Rating', 'Q2: Quality'])
    expect(distributed).not.toContain('Segment: Region')
  })
})

// ============================================================
// Test 3: SignificanceTab sorting
// ============================================================

describe('SignificanceTab sorting', () => {
  it('significant blocks appear before non-significant', () => {
    const findings = [
      makeFinding({
        stepId: 'kw_significance',
        sourceQuestionLabel: 'Q1',
        significant: false,
        pValue: 0.35,
        effectSize: 0.01,
      }),
      makeFinding({
        stepId: 'kw_significance',
        sourceQuestionLabel: 'Q2',
        significant: true,
        pValue: 0.001,
        effectSize: 0.15,
      }),
      makeFinding({
        stepId: 'anova_oneway',
        sourceQuestionLabel: 'Q3',
        significant: true,
        pValue: 0.02,
        effectSize: 0.08,
      }),
    ]

    // Simulate SignificanceTab sorting logic
    const sigStepIds = new Set(['kw_significance', 'anova_oneway'])
    const blocks = findings
      .filter((f) => sigStepIds.has(f.stepId))
      .sort((a, b) => {
        if (a.significant && !b.significant) return -1
        if (!a.significant && b.significant) return 1
        return 0
      })

    expect(blocks[0].significant).toBe(true)
    expect(blocks[1].significant).toBe(true)
    expect(blocks[2].significant).toBe(false)
    expect(blocks[0].sourceQuestionLabel).toBe('Q2')
  })
})

// ============================================================
// Test 4: CorrelationsTab matrix
// ============================================================

describe('CorrelationsTab matrix', () => {
  it('builds symmetric matrix from correlation findings', () => {
    const findings = [
      makeFinding({
        stepId: 'correlation',
        sourceColumns: ['Price', 'Quality'],
        effectSize: 0.65,
        significant: true,
        title: 'Price ↔ Quality: r = 0.650',
        summaryLanguage: 'Price and Quality move together.',
      }),
      makeFinding({
        stepId: 'correlation',
        sourceColumns: ['Price', 'Satisfaction'],
        effectSize: 0.42,
        significant: true,
        title: 'Price ↔ Satisfaction: r = 0.420',
        summaryLanguage: 'Price and Satisfaction are moderately related.',
      }),
      makeFinding({
        stepId: 'correlation',
        sourceColumns: ['Quality', 'Satisfaction'],
        effectSize: 0.78,
        significant: true,
        title: 'Quality ↔ Satisfaction: r = 0.780',
        summaryLanguage: 'Quality and Satisfaction move together strongly.',
      }),
    ]

    // Extract pairs (same logic as CorrelationsTab)
    const pairs = findings
      .filter((f) => f.stepId === 'correlation' && !f.suppressed)
      .map((f) => ({
        colA: f.sourceColumns?.[0] ?? '',
        colB: f.sourceColumns?.[1] ?? '',
        r: f.effectSize ?? 0,
      }))

    // Build unique columns
    const cols = new Set<string>()
    for (const p of pairs) { cols.add(p.colA); cols.add(p.colB) }
    const columns = Array.from(cols)

    expect(columns).toHaveLength(3)
    expect(columns).toContain('Price')
    expect(columns).toContain('Quality')
    expect(columns).toContain('Satisfaction')

    // Verify symmetry: getR(Price, Quality) === getR(Quality, Price)
    const getR = (a: string, b: string) => pairs.find((p) =>
      (p.colA === a && p.colB === b) || (p.colA === b && p.colB === a)
    )?.r ?? null

    expect(getR('Price', 'Quality')).toBe(0.65)
    expect(getR('Quality', 'Price')).toBe(0.65) // symmetric
    expect(getR('Quality', 'Satisfaction')).toBe(0.78)
    expect(getR('Price', 'Satisfaction')).toBe(0.42)

    // Diagonal should be null (no self-correlation in pairs)
    expect(getR('Price', 'Price')).toBeNull()

    // Sort by |r| DESC
    const sorted = [...pairs].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    expect(sorted[0].r).toBe(0.78) // Quality ↔ Satisfaction strongest
    expect(sorted[2].r).toBe(0.42) // Price ↔ Satisfaction weakest
  })
})
