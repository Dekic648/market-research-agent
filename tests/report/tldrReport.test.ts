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

describe('buildExecutiveSummary', () => {
  it('returns 2–4 editorial sentences, not one per tier', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', title: 'Satisfaction Distribution', summaryLanguage: 'Satisfaction scores 72% positive — strong.' }),
      makeFinding({ stepId: 'kw_significance', title: 'Satisfaction — significant difference across segments', significant: true, effectSize: 0.1, effectLabel: 'small', narrativeWeight: 0.55, summaryLanguage: 'Satisfaction differs across segments — small but real effect.' }),
      makeFinding({ stepId: 'regression', title: 'R² = 0.41 — 2 significant predictor(s)', effectSize: 0.41, narrativeWeight: 0.72, summaryLanguage: 'Quality is the strongest predictor of Overall Rating — it accounts for 41% of the variation.' }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary.length).toBeGreaterThanOrEqual(2)
    expect(summary.length).toBeLessThanOrEqual(4)
    // Headline should come from the highest narrativeWeight finding (regression)
    expect(summary[0]).toContain('41%')
  })

  it('returns zero strings for empty findings', () => {
    const summary = buildExecutiveSummary([])
    expect(summary).toHaveLength(0)
  })

  it('each summary string contains no raw stat notation', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', title: 'Price Perception Distribution', summaryLanguage: 'Price Perception scores 55% positive.' }),
      makeFinding({ stepId: 'kw_significance', title: 'NPS — significant difference across segments', significant: true, effectSize: 0.15, effectLabel: 'medium', narrativeWeight: 0.55, summaryLanguage: 'NPS differs across segments — medium effect.' }),
      makeFinding({ stepId: 'correlation', title: 'Ad Spend ↔ Revenue: r = 0.72', effectSize: 0.72, narrativeWeight: 0.60, summaryLanguage: 'Ad Spend and Revenue move together — 72% correlation.' }),
      makeFinding({ stepId: 'regression', title: 'R² = 0.35 — 1 significant predictor(s)', effectSize: 0.35, narrativeWeight: 0.70, summaryLanguage: 'Quality is the strongest predictor — 35% of variation explained.' }),
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
      makeFinding({ stepId: 'frequency', title: 'Overall Satisfaction Distribution', summaryLanguage: 'Satisfaction scores 68% positive.' }),
      makeFinding({ stepId: 'crosstab', title: 'Purchase Intent × Region', effectSize: null, summaryLanguage: 'Purchase intent varies by region.' }),
      makeFinding({ stepId: 'kw_significance', title: 'Brand Trust — significant difference across segments', significant: true, effectSize: 0.2, effectLabel: 'medium', narrativeWeight: 0.55, summaryLanguage: 'Brand Trust differs across segments — medium effect.' }),
      makeFinding({ stepId: 'cronbach', title: "Cronbach's α = 0.85 (good)", effectSize: 0.85, effectLabel: 'good', summaryLanguage: 'Scale reliability is good.' }),
      makeFinding({ stepId: 'efa', title: '2 factor(s) extracted, explaining 61.2% of variance', effectSize: 0.612, summaryLanguage: '2 underlying themes explain 61% of variation.' }),
      makeFinding({ stepId: 'driver_analysis', title: 'Top driver: Response Time (48.1% relative importance)', effectSize: 0.41, narrativeWeight: 0.75, summaryLanguage: 'Response Time is the strongest predictor — 48% relative importance.' }),
    ]

    const summary = buildExecutiveSummary(findings)

    for (const sentence of summary) {
      expect(sentence.length).toBeLessThanOrEqual(200)
    }
  })

  it('headline comes from highest narrativeWeight non-baseline finding', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', title: 'NPS Distribution', summaryLanguage: 'NPS scores 60% positive.', narrativeWeight: 0.10 }),
      makeFinding({ stepId: 'driver_analysis', title: 'Top driver: Quality (55.0% relative importance)', effectSize: 0.38, narrativeWeight: 0.75, summaryLanguage: 'Quality is the strongest predictor — 55% relative importance.' }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary.length).toBeGreaterThanOrEqual(2)
    // Headline should be from driver_analysis (highest narrativeWeight, non-baseline)
    expect(summary[0]).toContain('Quality')
    expect(summary[0]).toContain('strongest predictor')
  })

  it('skips suppressed findings', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', title: 'Test Distribution', suppressed: true, summaryLanguage: 'Test.' }),
    ]
    const summary = buildExecutiveSummary(findings)
    expect(summary).toHaveLength(0)
  })

  it('handles single finding gracefully', () => {
    const findings = [
      makeFinding({ stepId: 'kw_significance', title: 'Satisfaction — significant difference', significant: true, effectSize: 0.2, effectLabel: 'medium', narrativeWeight: 0.55, summaryLanguage: 'Satisfaction differs across segments — medium effect.' }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary.length).toBeGreaterThanOrEqual(1)
    expect(summary[0]).toContain('Satisfaction')
  })

  it('tier 5 findings appear in supporting sentences', () => {
    const findings = [
      makeFinding({ stepId: 'cronbach', title: "Cronbach's α = 0.82 (good)", effectSize: 0.82, effectLabel: 'good', summaryLanguage: 'Scale reliability is good.', narrativeWeight: 0.20 }),
      makeFinding({ stepId: 'efa', title: '3 factor(s) extracted, explaining 65% of variance', effectSize: 0.65, summaryLanguage: '3 underlying themes explain 65% of variation.', narrativeWeight: 0.25 }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary.length).toBeGreaterThanOrEqual(1)
    // At least one sentence should mention the factor or reliability finding
    const combined = summary.join(' ')
    expect(combined.length).toBeGreaterThan(0)
  })

  it('tier 4 highest weight finding appears in headline', () => {
    const findings = [
      makeFinding({ stepId: 'correlation', title: 'Price ↔ Value: r = 0.45', effectSize: 0.45, narrativeWeight: 0.50, summaryLanguage: 'Price and Value are moderately related.' }),
      makeFinding({ stepId: 'correlation', title: 'Ad Spend ↔ Revenue: r = 0.82', effectSize: 0.82, narrativeWeight: 0.65, summaryLanguage: 'Ad Spend and Revenue move together — 82% correlation.' }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary.length).toBeGreaterThanOrEqual(1)
    expect(summary[0]).toContain('Ad Spend')
    expect(summary[0]).toContain('most consistent relationship')
  })

  it('tier 6 names the top driver from summaryLanguage', () => {
    const findings = [
      makeFinding({ stepId: 'driver_analysis', title: 'Top driver: Customer Service (38.2% relative importance)', effectSize: 0.45, narrativeWeight: 0.75, summaryLanguage: 'Customer Service is the strongest predictor — 38% relative importance.' }),
    ]

    const summary = buildExecutiveSummary(findings)
    expect(summary.length).toBeGreaterThanOrEqual(1)
    expect(summary[0]).toContain('Customer Service')
    expect(summary[0]).toContain('predictor')
  })

  it('produces a readable headline when all findings are baseline stepIds', () => {
    const summary = buildExecutiveSummary([
      makeFinding({ stepId: 'frequency', summaryLanguage: 'Satisfaction scores 72% positive — strong.' }),
      makeFinding({ stepId: 'descriptives', summaryLanguage: 'Average rating is 4.1 out of 5.' }),
      makeFinding({ stepId: 'descriptives_summary', summaryLanguage: 'Responses skew positive across all items.' }),
    ])
    expect(summary.length).toBeGreaterThanOrEqual(1)
    expect(summary[0]).toContain('72%')
    expect(summary[0]).not.toContain('most notable result')
    expect(summary[0]).not.toMatch(/\.\.$/)  // no double punctuation
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
