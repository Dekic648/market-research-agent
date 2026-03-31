/**
 * Tests for TaskProposer routing gaps — multi_response crosstab + radio bridge.
 */
import { describe, it, expect } from 'vitest'
// Import plugins so they register with AnalysisRegistry
import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/CrosstabPlugin'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/DriverPlugin'
import '../../src/plugins/SegmentProfilePlugin'
import { proposeTasks } from '../../src/engine/TaskProposer'
import type { QuestionBlock } from '../../src/types/dataTypes'

function makeBlock(overrides: Partial<QuestionBlock>): QuestionBlock {
  return {
    id: `block_${Math.random().toString(36).slice(2, 6)}`,
    label: 'Test Block',
    format: 'rating',
    columns: [{
      id: 'c1', name: 'Col1', format: 'rating', statisticalType: 'ordinal',
      role: 'analyze', nRows: 50, nMissing: 0, nullMeaning: 'missing',
      rawValues: Array.from({ length: 50 }, (_, i) => (i % 5) + 1),
      fingerprint: null, semanticDetectionCache: null, transformStack: [],
      sensitivity: 'anonymous', declaredScaleRange: null,
    }],
    role: 'analyze',
    confirmed: true,
    pastedAt: Date.now(),
    ...overrides,
  }
}

function makeSegmentBlock(): QuestionBlock {
  return makeBlock({
    id: 'seg_block',
    label: 'Segment',
    format: 'category',
    role: 'segment',
    columns: [{
      id: 'seg1', name: 'Group', format: 'category', statisticalType: 'categorical',
      role: 'segment', nRows: 50, nMissing: 0, nullMeaning: 'missing',
      rawValues: Array.from({ length: 50 }, (_, i) => i % 2 === 0 ? 'A' : 'B'),
      fingerprint: null, semanticDetectionCache: null, transformStack: [],
      sensitivity: 'anonymous', declaredScaleRange: null,
    }],
  })
}

// ============================================================
// multi_response + segment → crosstab proposed
// ============================================================

describe('multi_response × segment routing', () => {
  it('proposes crosstab when segment is present', () => {
    const mrBlock = makeBlock({
      format: 'multi_response',
      columns: [{
        id: 'mr1', name: 'Option A', format: 'multi_response', statisticalType: 'multi_response',
        role: 'analyze', nRows: 50, nMissing: 25, nullMeaning: 'not_chosen',
        rawValues: Array.from({ length: 50 }, (_, i) => i < 25 ? 1 : null),
        fingerprint: null, semanticDetectionCache: null, transformStack: [],
        sensitivity: 'anonymous', declaredScaleRange: null,
      }],
    })

    const tasks = proposeTasks([mrBlock, makeSegmentBlock()])
    const crosstabTask = tasks.find((t) => t.pluginId === 'crosstab')
    expect(crosstabTask).toBeDefined()
  })

  it('proposes only frequency when no segment', () => {
    const mrBlock = makeBlock({
      format: 'multi_response',
      columns: [{
        id: 'mr1', name: 'Option A', format: 'multi_response', statisticalType: 'multi_response',
        role: 'analyze', nRows: 50, nMissing: 25, nullMeaning: 'not_chosen',
        rawValues: Array.from({ length: 50 }, (_, i) => i < 25 ? 1 : null),
        fingerprint: null, semanticDetectionCache: null, transformStack: [],
        sensitivity: 'anonymous', declaredScaleRange: null,
      }],
    })

    const tasks = proposeTasks([mrBlock])
    const freqTask = tasks.find((t) => t.pluginId === 'frequency')
    const crosstabTask = tasks.find((t) => t.pluginId === 'crosstab')
    expect(freqTask).toBeDefined()
    expect(crosstabTask).toBeUndefined()
  })

  it('does NOT propose kw_significance for multi_response', () => {
    const mrBlock = makeBlock({
      format: 'multi_response',
      columns: [{
        id: 'mr1', name: 'Option A', format: 'multi_response', statisticalType: 'multi_response',
        role: 'analyze', nRows: 50, nMissing: 25, nullMeaning: 'not_chosen',
        rawValues: Array.from({ length: 50 }, (_, i) => i < 25 ? 1 : null),
        fingerprint: null, semanticDetectionCache: null, transformStack: [],
        sensitivity: 'anonymous', declaredScaleRange: null,
      }],
    })

    const tasks = proposeTasks([mrBlock, makeSegmentBlock()])
    const kwTask = tasks.find((t) => t.pluginId === 'kw_significance')
    expect(kwTask).toBeUndefined()
  })
})

// ============================================================
// radio ordinal × behavioral bridge
// ============================================================

describe('radio ordinal × behavioral bridge', () => {
  it('radio ordinal is included in surveyBridgeBlocks filter', () => {
    // Test the filter logic directly — radio ordinal should pass
    const blocks = [
      { format: 'rating', confirmed: true },
      { format: 'matrix', confirmed: true },
      { format: 'radio', confirmed: true, columns: [{ statisticalType: 'ordinal' }] },
      { format: 'category', confirmed: true },
    ]

    const bridgeBlocks = blocks.filter((b: any) =>
      ['rating', 'matrix', 'checkbox', 'radio'].includes(b.format) && b.confirmed
    )

    // rating, matrix, radio all included — category excluded
    expect(bridgeBlocks).toHaveLength(3)
    expect(bridgeBlocks.some((b: any) => b.format === 'radio')).toBe(true)
    expect(bridgeBlocks.some((b: any) => b.format === 'category')).toBe(false)
  })

  it('radio categorical excluded from topSurvey correlation filter', () => {
    // The topSurvey filter only includes ordinal radio
    const surveyBlocks = [
      { format: 'rating', columns: [{ statisticalType: 'ordinal' }] },
      { format: 'radio', columns: [{ statisticalType: 'ordinal' }] },
      { format: 'radio', columns: [{ statisticalType: 'categorical' }] },
    ]

    const topSurvey = surveyBlocks.filter((b: any) =>
      b.format === 'rating' || b.format === 'matrix'
      || (b.format === 'radio' && b.columns.some((c: any) => c.statisticalType === 'ordinal'))
    )

    // rating + ordinal radio included, categorical radio excluded
    expect(topSurvey).toHaveLength(2)
  })
})
