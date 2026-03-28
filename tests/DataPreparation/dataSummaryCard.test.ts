/**
 * DataSummary builder tests.
 */
import { describe, it, expect } from 'vitest'
import { buildDataSummary } from '../../src/report/schema/dataSummary'
import type { QuestionBlock } from '../../src/types/dataTypes'

function makeBlock(
  type: QuestionBlock['questionType'],
  cols: Array<{ name: string; rawValues?: (number | string | null)[] }>
): QuestionBlock {
  return {
    id: `b_${type}_${Math.random().toString(36).slice(2, 5)}`,
    label: type,
    questionType: type,
    columns: cols.map((c, i) => ({
      id: `c_${i}_${Math.random().toString(36).slice(2, 5)}`,
      name: c.name,
      type,
      nRows: (c.rawValues ?? [1, 2, 3]).length,
      nMissing: 0,
      nullMeaning: 'missing' as const,
      rawValues: c.rawValues ?? Array.from({ length: 50 }, (_, j) => j),
      fingerprint: null,
      semanticDetectionCache: null,
      transformStack: [],
      sensitivity: 'anonymous' as const,
      declaredScaleRange: null,
    })),
    role: 'question',
    confirmed: true,
    pastedAt: Date.now(),
  }
}

describe('buildDataSummary', () => {
  it('assigns rating and matrix blocks to Survey questions family', () => {
    const blocks = [
      makeBlock('rating', [{ name: 'satisfaction' }]),
      makeBlock('matrix', [{ name: 'trust_1' }, { name: 'trust_2' }]),
    ]
    const summary = buildDataSummary(blocks, 100, 10)
    const survey = summary.families.find((f) => f.label === 'Survey questions')
    expect(survey).toBeDefined()
    expect(survey!.count).toBe(3)
  })

  it('assigns behavioral blocks to Behavioral data family', () => {
    const blocks = [
      makeBlock('behavioral', [{ name: 'games_played' }, { name: 'revenue' }]),
    ]
    const summary = buildDataSummary(blocks, 100, 10)
    const behavioral = summary.families.find((f) => f.label === 'Behavioral data')
    expect(behavioral).toBeDefined()
    expect(behavioral!.count).toBe(2)
  })

  it('assigns category and radio blocks to Segments family', () => {
    const blocks = [
      makeBlock('category', [{ name: 'region' }]),
      makeBlock('radio', [{ name: 'plan_type' }]),
    ]
    const summary = buildDataSummary(blocks, 100, 10)
    const segments = summary.families.find((f) => f.label === 'Segments')
    expect(segments).toBeDefined()
    expect(segments!.count).toBe(2)
  })

  it('assigns timestamped blocks to Time data family', () => {
    const blocks = [
      makeBlock('timestamped', [{ name: 'signup_date', rawValues: ['2024-01-01', '2024-06-15', '2025-01-01'] }]),
    ]
    const summary = buildDataSummary(blocks, 100, 10)
    const time = summary.families.find((f) => f.label === 'Time data')
    expect(time).toBeDefined()
    expect(time!.count).toBe(1)
  })

  it('survey subgroup counting works correctly', () => {
    const blocks = [
      makeBlock('rating', [{ name: 'sat_1' }, { name: 'sat_2' }, { name: 'sat_3' }]),
      makeBlock('checkbox', [{ name: 'feature_a' }, { name: 'feature_b' }]),
      makeBlock('verbatim', [{ name: 'comment' }]),
    ]
    const summary = buildDataSummary(blocks, 100, 10)
    const survey = summary.families.find((f) => f.label === 'Survey questions')
    expect(survey!.subgroups).toBeDefined()
    expect(survey!.subgroups).toContain('3 rating scales')
    expect(survey!.subgroups).toContain('2 checkbox questions')
    expect(survey!.subgroups).toContain('1 open text question')
  })

  it('families with zero blocks are omitted', () => {
    const blocks = [
      makeBlock('behavioral', [{ name: 'revenue' }]),
    ]
    const summary = buildDataSummary(blocks, 100, 10)
    expect(summary.families.some((f) => f.label === 'Survey questions')).toBe(false)
    expect(summary.families.some((f) => f.label === 'Segments')).toBe(false)
  })

  it('rowCount equals provided value', () => {
    const summary = buildDataSummary([], 487, 10)
    expect(summary.rowCount).toBe(487)
  })

  it('availableAnalysisCount is passed through', () => {
    const summary = buildDataSummary([], 100, 14)
    expect(summary.availableAnalysisCount).toBe(14)
  })

  it('date range is extracted from timestamped column values', () => {
    const blocks = [
      makeBlock('timestamped', [{
        name: 'created_at',
        rawValues: ['2019-02-15', '2021-06-01', '2025-07-20'],
      }]),
    ]
    const summary = buildDataSummary(blocks, 100, 10)
    const time = summary.families.find((f) => f.label === 'Time data')
    expect(time!.dateRange).toBeDefined()
    expect(time!.dateRange).toContain('2019')
    expect(time!.dateRange).toContain('2025')
  })

  it('preview shows maximum 3 column names per family', () => {
    const blocks = [
      makeBlock('behavioral', [
        { name: 'col_1' }, { name: 'col_2' }, { name: 'col_3' },
        { name: 'col_4' }, { name: 'col_5' },
      ]),
    ]
    const summary = buildDataSummary(blocks, 100, 10)
    const behavioral = summary.families.find((f) => f.label === 'Behavioral data')
    expect(behavioral!.preview.length).toBeLessThanOrEqual(3)
  })
})
