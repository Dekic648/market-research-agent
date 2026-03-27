/**
 * Report Generation tests.
 */
import { describe, it, expect } from 'vitest'
import {
  createReportSchema, addSection, removeSection, reorderSections,
  type ReportSchema,
} from '../../src/report/schema/ReportSchema'
import {
  evaluateCondition, resolveConditionalSections,
} from '../../src/report/schema/conditionEvaluator'
import {
  JSONRenderer, type RenderContext,
} from '../../src/report/renderer/ReportRenderer'
import type { Finding, ChartConfig } from '../../src/types/dataTypes'

describe('ReportSchema', () => {
  it('creates an empty schema', () => {
    const schema = createReportSchema({
      createdBy: 'user1',
      sourceDatasetIds: ['node1'],
      analysisLogSnapshot: ['log1'],
    })
    expect(schema.sections).toEqual([])
    expect(schema.createdBy).toBe('user1')
    expect(schema.version).toBe(1)
  })

  it('adds sections immutably', () => {
    const s1 = createReportSchema({ createdBy: 'u', sourceDatasetIds: [], analysisLogSnapshot: [] })
    const s2 = addSection(s1, { type: 'narrative', text: 'Hello' })

    expect(s1.sections).toHaveLength(0)
    expect(s2.sections).toHaveLength(1)
    expect(s2.sections[0].type).toBe('narrative')
  })

  it('removes sections immutably', () => {
    let s = createReportSchema({ createdBy: 'u', sourceDatasetIds: [], analysisLogSnapshot: [] })
    s = addSection(s, { type: 'narrative', text: 'A' })
    s = addSection(s, { type: 'narrative', text: 'B' })
    const removed = removeSection(s, 0)

    expect(s.sections).toHaveLength(2)
    expect(removed.sections).toHaveLength(1)
    expect((removed.sections[0] as any).text).toBe('B')
  })

  it('reorders sections', () => {
    let s = createReportSchema({ createdBy: 'u', sourceDatasetIds: [], analysisLogSnapshot: [] })
    s = addSection(s, { type: 'narrative', text: 'A' })
    s = addSection(s, { type: 'narrative', text: 'B' })
    s = addSection(s, { type: 'narrative', text: 'C' })
    const reordered = reorderSections(s, 2, 0)

    expect((reordered.sections[0] as any).text).toBe('C')
    expect((reordered.sections[1] as any).text).toBe('A')
    expect((reordered.sections[2] as any).text).toBe('B')
  })
})

describe('evaluateCondition', () => {
  const ctx = { values: { R2: 0.45, alpha: 0.82, p: 0.003, n: 150 } }

  it('evaluates > correctly', () => {
    expect(evaluateCondition('R2 > 0.3', ctx)).toBe(true)
    expect(evaluateCondition('R2 > 0.5', ctx)).toBe(false)
  })

  it('evaluates < correctly', () => {
    expect(evaluateCondition('p < 0.05', ctx)).toBe(true)
    expect(evaluateCondition('p < 0.001', ctx)).toBe(false)
  })

  it('evaluates >= and <=', () => {
    expect(evaluateCondition('n >= 150', ctx)).toBe(true)
    expect(evaluateCondition('n <= 100', ctx)).toBe(false)
  })

  it('evaluates == and !=', () => {
    expect(evaluateCondition('n == 150', ctx)).toBe(true)
    expect(evaluateCondition('n != 150', ctx)).toBe(false)
  })

  it('handles "true" and "false"', () => {
    expect(evaluateCondition('true', ctx)).toBe(true)
    expect(evaluateCondition('false', ctx)).toBe(false)
  })

  it('returns true for unknown variables (fail-open)', () => {
    expect(evaluateCondition('unknownVar > 5', ctx)).toBe(true)
  })

  it('returns true for empty expression', () => {
    expect(evaluateCondition('', ctx)).toBe(true)
  })
})

describe('resolveConditionalSections', () => {
  it('includes sections whose conditions pass', () => {
    const sections = [
      { type: 'narrative', text: 'Always shown' },
      { type: 'conditional', showIf: 'R2 > 0.3', section: { type: 'narrative', text: 'R2 is good' } },
      { type: 'conditional', showIf: 'R2 > 0.9', section: { type: 'narrative', text: 'R2 is excellent' } },
    ]
    const ctx = { values: { R2: 0.45 } }
    const resolved = resolveConditionalSections(sections as any, ctx)

    expect(resolved).toHaveLength(2)
    expect((resolved[0] as any).text).toBe('Always shown')
    expect((resolved[1] as any).text).toBe('R2 is good')
  })
})

describe('JSONRenderer', () => {
  it('renders a schema with findings and narratives', () => {
    let schema = createReportSchema({ createdBy: 'u', sourceDatasetIds: ['n1'], analysisLogSnapshot: ['l1'] })
    schema = addSection(schema, { type: 'executive_summary', findingRefs: ['f1'] })
    schema = addSection(schema, { type: 'finding', findingId: 'f1' })
    schema = addSection(schema, { type: 'narrative', text: 'Custom commentary here.' })

    const finding: Finding = {
      id: 'f1', stepId: 'frequency', type: 'frequency',
      title: 'Q1 Distribution', summary: 'Mean = 3.5', detail: '',
      significant: false, pValue: null, adjustedPValue: null,
      effectSize: null, effectLabel: null, theme: null,
      suppressed: false, priority: 0, createdAt: Date.now(),
      dataVersion: 1, dataFingerprint: 'abc',
    }

    const context: RenderContext = {
      findings: new Map([['f1', finding]]),
      charts: new Map(),
      metadata: { title: 'Test Report', author: 'Analyst' },
    }

    const renderer = new JSONRenderer()
    const result = renderer.render(schema, context)

    expect(result.format).toBe('json')
    expect(result.sections).toHaveLength(3)
    expect(result.sections[0].type).toBe('executive_summary')
    expect(result.sections[0].content).toContain('Mean = 3.5')
    expect(result.sections[1].content).toContain('Q1 Distribution')
    expect(result.sections[2].content).toBe('Custom commentary here.')
    expect(result.metadata.title).toBe('Test Report')
  })
})
