/**
 * TLDR Report tests — executive summary generation and warnings section.
 */
import { describe, it, expect } from 'vitest'
import { buildExecutiveSummary } from '../../src/report/schema/executiveSummary'
import type { Finding } from '../../src/types/dataTypes'

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: `f_${Math.random().toString(36).slice(2)}`,
    stepId: 'frequency',
    type: 'frequency',
    title: 'Test Finding',
    summary: 'Test summary',
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

describe('buildExecutiveSummary', () => {
  it('returns one string per tier with findings', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', title: 'Satisfaction Distribution' }),
      makeFinding({ stepId: 'kw_significance', title: 'Satisfaction — significant difference across segments', significant: true, effectSize: 0.1, effectLabel: 'small' }),
      makeFinding({ stepId: 'regression', title: 'R² = 0.41 — 2 significant predictor(s)', effectSize: 0.41 }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary).toHaveLength(3)
  })

  it('returns zero strings for empty tiers', () => {
    const summary = buildExecutiveSummary([])
    expect(summary).toHaveLength(0)
  })

  it('each summary string contains no raw stat notation', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', title: 'Price Perception Distribution' }),
      makeFinding({ stepId: 'kw_significance', title: 'NPS — significant difference across segments', significant: true, effectSize: 0.15, effectLabel: 'medium' }),
      makeFinding({ stepId: 'correlation', title: 'Ad Spend ↔ Revenue: r = 0.72', effectSize: 0.72 }),
      makeFinding({ stepId: 'regression', title: 'R² = 0.35 — 1 significant predictor(s)', effectSize: 0.35 }),
    ]

    const summary = buildExecutiveSummary(findings)

    for (const sentence of summary) {
      // No raw H(df) notation
      expect(sentence).not.toMatch(/H\(\d+\)\s*=/)
      // No raw chi-square notation
      expect(sentence).not.toMatch(/χ²\(/)
      // No raw F(df1,df2) notation
      expect(sentence).not.toMatch(/F\(\d+,\s*\d+\)\s*=/)
    }
  })

  it('each summary string is under 200 characters', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', title: 'Overall Satisfaction Distribution' }),
      makeFinding({ stepId: 'crosstab', title: 'Purchase Intent × Region', effectSize: null }),
      makeFinding({ stepId: 'kw_significance', title: 'Brand Trust — significant difference across segments', significant: true, effectSize: 0.2, effectLabel: 'medium' }),
      makeFinding({ stepId: 'cronbach', title: "Cronbach's α = 0.85 (good)", effectSize: 0.85, effectLabel: 'good' }),
      makeFinding({ stepId: 'efa', title: '2 factor(s) extracted, explaining 61.2% of variance', effectSize: 0.612 }),
      makeFinding({ stepId: 'driver_analysis', title: 'Top driver: Response Time (48.1% relative importance)', effectSize: 0.41 }),
    ]

    const summary = buildExecutiveSummary(findings)

    for (const sentence of summary) {
      expect(sentence.length).toBeLessThanOrEqual(200)
    }
  })

  it('tier 1 + tier 6 only produces exactly 2 summary strings', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', title: 'NPS Distribution' }),
      makeFinding({ stepId: 'driver_analysis', title: 'Top driver: Quality (55.0% relative importance)', effectSize: 0.38 }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary).toHaveLength(2)
  })

  it('skips suppressed findings', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', title: 'Test Distribution', suppressed: true }),
    ]
    const summary = buildExecutiveSummary(findings)
    expect(summary).toHaveLength(0)
  })

  it('tier 3 sentence mentions count when multiple significant', () => {
    const findings = [
      makeFinding({ stepId: 'kw_significance', title: 'Satisfaction — significant difference', significant: true, effectSize: 0.2, effectLabel: 'medium' }),
      makeFinding({ stepId: 'kw_significance', title: 'Trust — significant difference', significant: true, effectSize: 0.1, effectLabel: 'small' }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary).toHaveLength(1)
    expect(summary[0]).toContain('2')
    expect(summary[0]).toContain('significant')
  })

  it('tier 5 handles both reliability and factor findings', () => {
    const findings = [
      makeFinding({ stepId: 'cronbach', title: "Cronbach's α = 0.82 (good)", effectSize: 0.82, effectLabel: 'good' }),
      makeFinding({ stepId: 'efa', title: '3 factor(s) extracted, explaining 65% of variance', effectSize: 0.65 }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary).toHaveLength(1)
    expect(summary[0]).toContain('good')
    expect(summary[0]).toContain('3')
  })

  it('tier 4 names the pair with strongest relationship', () => {
    const findings = [
      makeFinding({ stepId: 'correlation', title: 'Price ↔ Value: r = 0.45', effectSize: 0.45 }),
      makeFinding({ stepId: 'correlation', title: 'Ad Spend ↔ Revenue: r = 0.82', effectSize: 0.82 }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary).toHaveLength(1)
    expect(summary[0]).toContain('Ad Spend')
    expect(summary[0]).toContain('Revenue')
    expect(summary[0]).toContain('strongest')
  })

  it('tier 6 names the top driver from title', () => {
    const findings = [
      makeFinding({ stepId: 'driver_analysis', title: 'Top driver: Customer Service (38.2% relative importance)', effectSize: 0.45 }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary).toHaveLength(1)
    expect(summary[0]).toContain('Customer Service')
    expect(summary[0]).toContain('predictor')
  })
})

describe('Warnings section logic', () => {
  it('simpsons_paradox verification results are detectable', () => {
    const finding = makeFinding({
      stepId: 'kw_significance',
      title: 'Rating — significant difference',
      verificationResults: [{
        findingId: 'f1',
        checkType: 'simpsons_paradox',
        severity: 'warning',
        detail: {},
        message: 'Direction reverses within segment A',
      }],
    })

    const hasWarning = finding.verificationResults?.some((vr) => vr.severity === 'warning')
    expect(hasWarning).toBe(true)
  })

  it('findings without verification results have no warnings', () => {
    const finding = makeFinding({ stepId: 'frequency' })
    const hasWarning = finding.verificationResults?.some((vr) => vr.severity === 'warning') ?? false
    expect(hasWarning).toBe(false)
  })

  it('info-severity verification results are not counted as warnings', () => {
    const finding = makeFinding({
      stepId: 'kw_significance',
      verificationResults: [{
        findingId: 'f1',
        checkType: 'moderation_check',
        severity: 'info',
        detail: {},
        message: 'Some info note',
      }],
    })

    const hasWarning = finding.verificationResults?.some((vr) => vr.severity === 'warning') ?? false
    expect(hasWarning).toBe(false)
  })
})
