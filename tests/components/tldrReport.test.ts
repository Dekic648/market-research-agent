/**
 * Tests for TLDRReport assembly logic.
 */
import { describe, it, expect } from 'vitest'
import { assembleTLDR, shouldIncludeInTLDR, getKeyMetric } from '../../src/components/Report/TLDRReport'
import type { Finding } from '../../src/types/dataTypes'

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: `f_${Math.random().toString(36).slice(2, 6)}`,
    stepId: 'frequency',
    type: 'frequency',
    title: 'Test Finding',
    summary: 'Test summary.',
    detail: '',
    significant: true,
    pValue: 0.01,
    adjustedPValue: null,
    effectSize: 0.5,
    effectLabel: 'medium',
    theme: null,
    suppressed: false,
    priority: 0,
    createdAt: Date.now(),
    dataVersion: 1,
    dataFingerprint: 'fp',
    summaryLanguage: 'Test summary language.',
    ...overrides,
  }
}

describe('TLDRReport — assembly', () => {
  it('excludes non-significant small effect findings', () => {
    const f = makeFinding({
      stepId: 'correlation',
      significant: false,
      effectSize: 0.1,  // below threshold of 0.3
    })
    expect(shouldIncludeInTLDR(f)).toBe(false)
  })

  it('includes non-significant large effect findings', () => {
    const f = makeFinding({
      stepId: 'correlation',
      significant: false,
      effectSize: 0.5,  // above threshold of 0.3
    })
    expect(shouldIncludeInTLDR(f)).toBe(true)
  })

  it('sorts findings by narrativeWeight DESC within section', () => {
    const findings = [
      makeFinding({ stepId: 'correlation', effectSize: 0.3, narrativeWeight: 0.40, summaryLanguage: 'Weak.' }),
      makeFinding({ stepId: 'correlation', effectSize: 0.8, narrativeWeight: 0.70, summaryLanguage: 'Strong.' }),
      makeFinding({ stepId: 'correlation', effectSize: 0.5, narrativeWeight: 0.55, summaryLanguage: 'Medium.' }),
    ]
    const sections = assembleTLDR(findings)
    const corrSection = sections.find((s) => s.sectionKey === 'correlations')
    expect(corrSection).toBeDefined()
    expect(corrSection!.findings[0].narrativeWeight).toBe(0.70)
    expect(corrSection!.findings[1].narrativeWeight).toBe(0.55)
    expect(corrSection!.findings[2].narrativeWeight).toBe(0.40)
  })

  it('orders sections: distributions before drivers', () => {
    const findings = [
      makeFinding({ stepId: 'driver_analysis', summaryLanguage: 'Driver finding.' }),
      makeFinding({ stepId: 'frequency', summaryLanguage: 'Frequency finding.' }),
    ]
    const sections = assembleTLDR(findings)
    expect(sections.length).toBe(2)
    expect(sections[0].sectionKey).toBe('distributions')
    expect(sections[1].sectionKey).toBe('drivers')
  })

  it('uses summaryLanguage on findings', () => {
    const f = makeFinding({
      summaryLanguage: 'Quality scores 84% positive — strong.',
      summary: 'Full detailed summary with p-values etc.',
    })
    const sections = assembleTLDR([f])
    expect(sections[0].findings[0].summaryLanguage).toBe('Quality scores 84% positive — strong.')
  })

  it('includes cross-type badge info', () => {
    const f = makeFinding({
      crossType: true,
      summaryLanguage: 'Cross-type finding.',
    })
    const sections = assembleTLDR([f])
    expect(sections[0].findings[0].crossType).toBe(true)
  })

  it('excludes suppressed findings', () => {
    const f = makeFinding({ suppressed: true })
    expect(shouldIncludeInTLDR(f)).toBe(false)
  })

  it('getKeyMetric extracts appropriate metric', () => {
    const corrFinding = makeFinding({ stepId: 'correlation', effectSize: 0.61 })
    const metric = getKeyMetric(corrFinding)
    expect(metric).toBeDefined()
    expect(metric!.label).toBe('r')
    expect(metric!.value).toBe('0.61')
  })

  it('counts non-significant findings correctly', () => {
    const findings = [
      makeFinding({ significant: true }),
      makeFinding({ significant: false, effectSize: 0.01, stepId: 'correlation' }),
      makeFinding({ significant: false, effectSize: 0.02, stepId: 'regression' }),
    ]
    const nonSig = findings.filter((f) => !f.suppressed && !f.significant).length
    expect(nonSig).toBe(2)
  })
})
