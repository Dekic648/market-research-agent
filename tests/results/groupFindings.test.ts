import { describe, it, expect } from 'vitest'
import { groupFindings } from '../../src/results/groupFindings'
import type { Finding } from '../../src/types/dataTypes'

/** Helper to create a minimal Finding for testing */
function makeFinding(overrides: Partial<Finding> & { stepId: string }): Finding {
  return {
    id: `f_${Math.random().toString(36).slice(2, 6)}`,
    type: overrides.stepId,
    title: 'Test Finding',
    summary: 'Summary',
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
    ...overrides,
  }
}

describe('groupFindings', () => {
  it('returns empty array for empty input', () => {
    const result = groupFindings([])
    expect(result).toEqual([])
  })

  it('groups findings into correct method sections', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', sourceTaskId: 'task_freq_1', title: 'Freq Q1' }),
      makeFinding({ stepId: 'frequency', sourceTaskId: 'task_freq_2', title: 'Freq Q2' }),
      makeFinding({ stepId: 'cronbach', sourceTaskId: 'task_rel_1', title: 'Reliability Q1' }),
      makeFinding({ stepId: 'correlation', sourceTaskId: 'task_corr_1', title: 'Corr Q1 Q2' }),
    ]

    const sections = groupFindings(findings)

    expect(sections).toHaveLength(3)
    expect(sections[0].key).toBe('distributions')
    expect(sections[0].questionGroups).toHaveLength(2)
    expect(sections[1].key).toBe('reliability')
    expect(sections[1].questionGroups).toHaveLength(1)
    expect(sections[2].key).toBe('correlations')
    expect(sections[2].questionGroups).toHaveLength(1)
  })

  it('sorts sections by defined order', () => {
    const findings = [
      makeFinding({ stepId: 'driver_analysis', sourceTaskId: 'task_d1' }),
      makeFinding({ stepId: 'frequency', sourceTaskId: 'task_f1' }),
      makeFinding({ stepId: 'cronbach', sourceTaskId: 'task_r1' }),
    ]

    const sections = groupFindings(findings)
    const keys = sections.map((s) => s.key)

    // distributions (1) < reliability (2) < drivers (6)
    expect(keys).toEqual(['distributions', 'reliability', 'drivers'])
  })

  it('attaches posthoc findings to parent KW significance group', () => {
    const findings = [
      makeFinding({
        stepId: 'kw_significance',
        sourceTaskId: 'task_kw_1',
        sourceColumns: ['Quality', 'Region'],
        title: 'KW: Quality × Region',
      }),
      makeFinding({
        stepId: 'posthoc',
        sourceTaskId: 'task_ph_1',
        sourceColumns: ['Quality', 'Region'],
        title: 'PostHoc: Quality × Region',
      }),
    ]

    const sections = groupFindings(findings)

    expect(sections).toHaveLength(1) // both in group_comparisons
    expect(sections[0].key).toBe('group_comparisons')
    // PostHoc should be attached to KW group, not its own group
    expect(sections[0].questionGroups).toHaveLength(1)
    expect(sections[0].questionGroups[0].findings).toHaveLength(2)
    // KW should come before PostHoc (plugin order)
    expect(sections[0].questionGroups[0].findings[0].stepId).toBe('kw_significance')
    expect(sections[0].questionGroups[0].findings[1].stepId).toBe('posthoc')
  })

  it('flags non-significant question groups correctly', () => {
    const findings = [
      makeFinding({
        stepId: 'kw_significance',
        sourceTaskId: 'task_kw_ns',
        significant: false,
        pValue: 0.42,
        title: 'Not significant',
      }),
    ]

    const sections = groupFindings(findings)

    expect(sections[0].questionGroups[0].primarySignificant).toBe(false)
  })

  it('handles cross-question findings with multiple source columns', () => {
    const findings = [
      makeFinding({
        stepId: 'driver_analysis',
        sourceTaskId: 'task_driver_1',
        sourceColumns: ['Overall SAT', 'Quality', 'Price', 'Speed'],
        sourceQuestionLabel: 'Driver: Overall SAT ~ Quality + Price + Speed',
        title: 'Driver analysis',
      }),
    ]

    const sections = groupFindings(findings)

    expect(sections).toHaveLength(1)
    expect(sections[0].key).toBe('drivers')
    expect(sections[0].questionGroups[0].label).toBe('Driver: Overall SAT ~ Quality + Price + Speed')
  })

  it('excludes suppressed findings', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', sourceTaskId: 'task_f1', suppressed: false }),
      makeFinding({ stepId: 'frequency', sourceTaskId: 'task_f2', suppressed: true }),
    ]

    const sections = groupFindings(findings)

    expect(sections).toHaveLength(1)
    expect(sections[0].findingCount).toBe(1)
    expect(sections[0].questionGroups).toHaveLength(1)
  })

  it('puts unknown plugin IDs into other section', () => {
    const findings = [
      makeFinding({ stepId: 'some_future_plugin', sourceTaskId: 'task_x1' }),
    ]

    const sections = groupFindings(findings)

    expect(sections).toHaveLength(1)
    expect(sections[0].key).toBe('other')
    expect(sections[0].label).toBe('Other')
  })

  it('enriches question groups with charts and plainLanguage from step results', () => {
    const findings = [
      makeFinding({ stepId: 'frequency', sourceTaskId: 'task_f1' }),
    ]

    const taskStepResults = {
      task_f1: {
        pluginId: 'frequency',
        data: {},
        charts: [{ id: 'chart_1', type: 'horizontalBar' as const, data: [], layout: {}, config: {}, stepId: 'frequency', edits: {} }],
        findings: [],
        plainLanguage: 'Quality is rated highest at 85% positive.',
        assumptions: [],
        logEntry: {},
      },
    }

    const sections = groupFindings(findings, taskStepResults)

    expect(sections[0].questionGroups[0].charts).toHaveLength(1)
    expect(sections[0].questionGroups[0].plainLanguage).toBe('Quality is rated highest at 85% positive.')
  })

  it('sorts findings within a question group by plugin dependency order', () => {
    // All in group_comparisons section, same sourceTaskId
    const findings = [
      makeFinding({ stepId: 'kw_significance', sourceTaskId: 'task_shared', sourceColumns: ['Q1', 'Seg'] }),
      makeFinding({ stepId: 'crosstab', sourceTaskId: 'task_shared', sourceColumns: ['Q1', 'Seg'] }),
      makeFinding({ stepId: 'segment_profile', sourceTaskId: 'task_shared', sourceColumns: ['Q1', 'Seg'] }),
    ]

    const sections = groupFindings(findings)
    const group = sections[0].questionGroups[0]

    // crosstab (2) < segment_profile (3) < kw_significance (4)
    expect(group.findings[0].stepId).toBe('crosstab')
    expect(group.findings[1].stepId).toBe('segment_profile')
    expect(group.findings[2].stepId).toBe('kw_significance')
  })
})
