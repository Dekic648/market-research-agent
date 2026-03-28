/**
 * buildAutoReportSchema tests — schema generation from ordered findings.
 */
import { describe, it, expect } from 'vitest'
import { buildAutoReportSchema } from '../../src/report/schema/ReportSchema'
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

describe('buildAutoReportSchema', () => {
  it('produces sections in priority order', () => {
    const findings = [
      makeFinding({ id: 'f1', stepId: 'regression' }),
      makeFinding({ id: 'f2', stepId: 'frequency' }),
      makeFinding({ id: 'f3', stepId: 'kw_significance' }),
    ]

    const schema = buildAutoReportSchema(findings, ['Summary 1', 'Summary 2', 'Summary 3'])

    // First section is executive summary narrative
    expect(schema.sections[0].type).toBe('narrative')
    expect((schema.sections[0] as any).text).toContain('Summary 1')

    // Find the finding sections and verify order
    const findingSections = schema.sections.filter((s) => s.type === 'finding')
    expect(findingSections).toHaveLength(3)
    expect((findingSections[0] as any).findingId).toBe('f2')  // frequency (tier 1)
    expect((findingSections[1] as any).findingId).toBe('f3')  // kw_significance (tier 3)
    expect((findingSections[2] as any).findingId).toBe('f1')  // regression (tier 6)
  })

  it('sections with no findings are not included', () => {
    const findings = [
      makeFinding({ id: 'f1', stepId: 'frequency' }),
      makeFinding({ id: 'f2', stepId: 'regression' }),
    ]

    const schema = buildAutoReportSchema(findings, ['Line 1', 'Line 2'])

    // Should have: 1 exec summary + 2 tier headers + 2 findings = 5 sections
    // Tier 1 header + f1 + Tier 6 header + f2
    const narratives = schema.sections.filter((s) => s.type === 'narrative')
    const findingNodes = schema.sections.filter((s) => s.type === 'finding')

    expect(findingNodes).toHaveLength(2)
    // Only 2 tier headers (tier 1 and tier 6) + 1 exec summary = 3 narratives
    expect(narratives).toHaveLength(3)
  })

  it('each section contains the correct number of finding nodes per tier', () => {
    const findings = [
      makeFinding({ id: 'f1', stepId: 'frequency' }),
      makeFinding({ id: 'f2', stepId: 'frequency' }),
      makeFinding({ id: 'f3', stepId: 'correlation' }),
    ]

    const schema = buildAutoReportSchema(findings, [])

    const findingNodes = schema.sections.filter((s) => s.type === 'finding')
    expect(findingNodes).toHaveLength(3)

    // Tier 1 (frequency) has 2, tier 4 (correlation) has 1
    const tier1Findings = findingNodes.filter(
      (s) => findings.find((f) => f.id === (s as any).findingId)?.stepId === 'frequency'
    )
    const tier4Findings = findingNodes.filter(
      (s) => findings.find((f) => f.id === (s as any).findingId)?.stepId === 'correlation'
    )
    expect(tier1Findings).toHaveLength(2)
    expect(tier4Findings).toHaveLength(1)
  })

  it('excludes suppressed findings', () => {
    const findings = [
      makeFinding({ id: 'f1', stepId: 'frequency', suppressed: false }),
      makeFinding({ id: 'f2', stepId: 'frequency', suppressed: true }),
    ]

    const schema = buildAutoReportSchema(findings, [])
    const findingNodes = schema.sections.filter((s) => s.type === 'finding')
    expect(findingNodes).toHaveLength(1)
    expect((findingNodes[0] as any).findingId).toBe('f1')
  })

  it('includes warnings section when findings have verification warnings', () => {
    const findings = [
      makeFinding({
        id: 'f1',
        stepId: 'kw_significance',
        title: 'Rating — significant',
        verificationResults: [{
          findingId: 'f1',
          checkType: 'simpsons_paradox',
          severity: 'warning',
          detail: {},
          message: 'Direction reversal in segment',
        }],
      }),
    ]

    const schema = buildAutoReportSchema(findings, [])
    const narratives = schema.sections.filter((s) => s.type === 'narrative')

    // Should include "Results requiring attention" header
    const warningHeader = narratives.find((s) => (s as any).text.includes('Results requiring attention'))
    expect(warningHeader).toBeDefined()

    // And the warning message
    const warningMsg = narratives.find((s) => (s as any).text.includes('Direction reversal'))
    expect(warningMsg).toBeDefined()
  })

  it('omits warnings section when no verification warnings exist', () => {
    const findings = [
      makeFinding({ id: 'f1', stepId: 'frequency' }),
    ]

    const schema = buildAutoReportSchema(findings, [])
    const narratives = schema.sections.filter((s) => s.type === 'narrative')
    const warningHeader = narratives.find((s) => (s as any).text.includes('Results requiring attention'))
    expect(warningHeader).toBeUndefined()
  })

  it('schema has correct metadata', () => {
    const schema = buildAutoReportSchema([], [])
    expect(schema.id).toMatch(/^auto_report_/)
    expect(schema.version).toBe(1)
    expect(schema.createdBy).toBe('auto')
  })
})
