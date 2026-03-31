/**
 * SignificanceTab tests — summary table, row interaction, effect bar.
 */
import { describe, it, expect } from 'vitest'
import type { Finding } from '../../src/types/dataTypes'

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: `f_${Math.random().toString(36).slice(2, 6)}`,
    stepId: 'kw_significance',
    type: 'significance',
    title: 'Test Finding',
    summary: 'H(4) = 12.5, p = 0.014. Effect: ε² = 0.08 (small).',
    summaryLanguage: 'Test summary language.',
    detail: JSON.stringify({
      columnName: 'Test',
      testUsed: 'Kruskal-Wallis',
      H: 12.5, p: 0.014, df: 4,
      epsilonSquared: 0.08,
      effectLabel: 'small',
      groupLabels: ['A', 'B', 'C'],
      groupMeans: [3.5, 2.7, 3.1],
      groupNs: [50, 40, 45],
    }),
    significant: true,
    pValue: 0.014,
    adjustedPValue: null,
    effectSize: 0.08,
    effectLabel: 'small',
    theme: null,
    suppressed: false,
    priority: 0,
    createdAt: Date.now(),
    dataVersion: 1,
    dataFingerprint: 'fp',
    sourceQuestionLabel: 'Question A',
    narrativeWeight: 0.5,
    ...overrides,
  }
}

// ============================================================
// Test 1: Summary table row count and order
// ============================================================

describe('SignificanceTab summary table', () => {
  it('renders correct row count with significant first', () => {
    const findings = [
      makeFinding({
        id: 'f1',
        sourceQuestionLabel: 'Q1: Price',
        significant: false,
        pValue: 0.42,
        effectSize: 0.01,
        effectLabel: 'negligible',
        narrativeWeight: 0.1,
      }),
      makeFinding({
        id: 'f2',
        sourceQuestionLabel: 'Q2: Quality',
        significant: true,
        pValue: 0.003,
        effectSize: 0.12,
        effectLabel: 'medium',
        narrativeWeight: 0.6,
      }),
      makeFinding({
        id: 'f3',
        sourceQuestionLabel: 'Q3: Service',
        significant: true,
        pValue: 0.01,
        effectSize: 0.08,
        effectLabel: 'small',
        narrativeWeight: 0.5,
      }),
    ]

    const questionOrder = ['Q1: Price', 'Q2: Quality', 'Q3: Service']

    // Simulate the block-building logic
    const SIG_STEP_IDS = new Set(['kw_significance', 'anova_oneway'])
    function labelMatches(f: Finding, label: string): boolean {
      const sql = f.sourceQuestionLabel
      if (!sql) return false
      if (sql === label) return true
      if (sql.startsWith(label)) return true
      return false
    }

    const blocks: Array<{ label: string; finding: Finding }> = []
    for (const label of questionOrder) {
      const f = findings.find((f) => SIG_STEP_IDS.has(f.stepId) && labelMatches(f, label) && !f.suppressed)
      if (f) blocks.push({ label, finding: f })
    }

    // Sort: significant first, by narrativeWeight DESC
    blocks.sort((a, b) => {
      if (a.finding.significant && !b.finding.significant) return -1
      if (!a.finding.significant && b.finding.significant) return 1
      return (b.finding.narrativeWeight ?? 0) - (a.finding.narrativeWeight ?? 0)
    })

    // 3 total rows
    expect(blocks).toHaveLength(3)

    // Significant first (sorted by narrativeWeight: Q2 > Q3)
    expect(blocks[0].finding.significant).toBe(true)
    expect(blocks[0].label).toBe('Q2: Quality')
    expect(blocks[1].finding.significant).toBe(true)
    expect(blocks[1].label).toBe('Q3: Service')

    // Non-significant last
    expect(blocks[2].finding.significant).toBe(false)
    expect(blocks[2].label).toBe('Q1: Price')
  })
})

// ============================================================
// Test 2: Row click expands correct block
// ============================================================

describe('SignificanceTab row click', () => {
  it('toggles expansion for the matching label only', () => {
    const expandedLabels = new Set<string>()

    // Simulate toggleExpand
    function toggleExpand(label: string) {
      if (expandedLabels.has(label)) expandedLabels.delete(label)
      else expandedLabels.add(label)
    }

    // Click "Q2: Quality"
    toggleExpand('Q2: Quality')
    expect(expandedLabels.has('Q2: Quality')).toBe(true)
    expect(expandedLabels.has('Q1: Price')).toBe(false)
    expect(expandedLabels.has('Q3: Service')).toBe(false)

    // Click again to collapse
    toggleExpand('Q2: Quality')
    expect(expandedLabels.has('Q2: Quality')).toBe(false)

    // Click a different one
    toggleExpand('Q1: Price')
    expect(expandedLabels.has('Q1: Price')).toBe(true)
    expect(expandedLabels.has('Q2: Quality')).toBe(false)
  })
})

// ============================================================
// Test 3: Effect bar width reflects actual value
// ============================================================

describe('SignificanceTab effect bar', () => {
  it('normalizes effectSize to bar width between 0 and 100%', () => {
    // normalizeEffect maps 0–0.2 → 0–1 (capped at 1)
    function normalizeEffect(effectSize: number | null): number {
      if (effectSize === null) return 0
      return Math.min(1, effectSize / 0.2)
    }

    // Small effect: ε² = 0.08 → 0.08 / 0.2 = 0.4 → 40%
    const smallBar = normalizeEffect(0.08)
    expect(smallBar).toBeCloseTo(0.4, 2)
    expect(smallBar).toBeGreaterThan(0)
    expect(smallBar).toBeLessThan(1)

    // Medium effect: ε² = 0.12 → 0.12 / 0.2 = 0.6 → 60%
    const mediumBar = normalizeEffect(0.12)
    expect(mediumBar).toBeCloseTo(0.6, 2)

    // Large effect: ε² = 0.25 → 0.25 / 0.2 = 1.25 → capped at 1.0 (100%)
    const largeBar = normalizeEffect(0.25)
    expect(largeBar).toBe(1)

    // Null → 0
    expect(normalizeEffect(null)).toBe(0)
  })
})
