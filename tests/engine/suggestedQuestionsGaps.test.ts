/**
 * Tests for suggested questions — multi_response support + no regression.
 */
import { describe, it, expect } from 'vitest'
import { generateSuggestedQuestions } from '../../src/engine/suggestedQuestions'
import type { QuestionBlock, ColumnDefinition } from '../../src/types/dataTypes'

function makeCol(overrides: Partial<ColumnDefinition>): ColumnDefinition {
  return {
    id: `c_${Math.random().toString(36).slice(2, 6)}`,
    name: 'Test Col',
    format: 'rating',
    statisticalType: 'ordinal',
    role: 'analyze',
    nRows: 50,
    nMissing: 0,
    nullMeaning: 'missing',
    rawValues: Array.from({ length: 50 }, (_, i) => (i % 5) + 1),
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: [],
    sensitivity: 'anonymous',
    declaredScaleRange: null,
    ...overrides,
  }
}

function makeBlock(overrides: Partial<QuestionBlock>): QuestionBlock {
  return {
    id: `b_${Math.random().toString(36).slice(2, 6)}`,
    label: 'Test Block',
    format: 'rating',
    columns: [makeCol({})],
    role: 'analyze',
    confirmed: true,
    pastedAt: Date.now(),
    ...overrides,
  }
}

describe('suggestedQuestions — multi_response', () => {
  it('generates at least one suggestion for multi_response columns', () => {
    const mrBlock = makeBlock({
      format: 'multi_response',
      columns: [
        makeCol({ id: 'mr1', name: 'Feature A', format: 'multi_response', statisticalType: 'multi_response', nullMeaning: 'not_chosen' }),
        makeCol({ id: 'mr2', name: 'Feature B', format: 'multi_response', statisticalType: 'multi_response', nullMeaning: 'not_chosen' }),
        makeCol({ id: 'mr3', name: 'Feature C', format: 'multi_response', statisticalType: 'multi_response', nullMeaning: 'not_chosen' }),
      ],
    })

    const questions = generateSuggestedQuestions([mrBlock])
    expect(questions.length).toBeGreaterThanOrEqual(1)
    expect(questions.some((q) => q.question.includes('most selected'))).toBe(true)
  })

  it('generates segment comparison when segment column present', () => {
    const mrBlock = makeBlock({
      format: 'multi_response',
      columns: [
        makeCol({ id: 'mr1', name: 'Feature A', format: 'multi_response', statisticalType: 'multi_response' }),
      ],
    })
    const catBlock = makeBlock({
      format: 'category',
      role: 'analyze',
      columns: [
        makeCol({ id: 'cat1', name: 'Region', format: 'category', statisticalType: 'categorical' }),
      ],
    })

    const questions = generateSuggestedQuestions([mrBlock, catBlock])
    expect(questions.some((q) => q.question.includes('differ by'))).toBe(true)
  })
})

describe('suggestedQuestions — no regression for existing formats', () => {
  it('rating columns still produce suggestions', () => {
    const ratingBlock = makeBlock({
      format: 'rating',
      columns: [
        makeCol({ id: 'r1', name: 'Satisfaction', format: 'rating' }),
        makeCol({ id: 'r2', name: 'Quality', format: 'rating' }),
      ],
    })
    const catBlock = makeBlock({
      format: 'category',
      role: 'analyze',
      columns: [
        makeCol({ id: 'cat1', name: 'Segment', format: 'category', statisticalType: 'categorical' }),
      ],
    })

    const questions = generateSuggestedQuestions([ratingBlock, catBlock])
    expect(questions.length).toBeGreaterThanOrEqual(1)
  })

  it('checkbox columns get categorized with multi_response', () => {
    const cbBlock = makeBlock({
      format: 'checkbox',
      columns: [
        makeCol({ id: 'cb1', name: 'Opted In', format: 'checkbox', statisticalType: 'binary' }),
      ],
    })

    const questions = generateSuggestedQuestions([cbBlock])
    expect(questions.length).toBeGreaterThanOrEqual(1)
    expect(questions.some((q) => q.question.includes('most selected'))).toBe(true)
  })
})
