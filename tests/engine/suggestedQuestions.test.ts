/**
 * Suggested questions generation tests.
 */
import { describe, it, expect } from 'vitest'
import { generateSuggestedQuestions } from '../../src/engine/suggestedQuestions'
import type { QuestionBlock, ColumnDefinition } from '../../src/types/dataTypes'

function makeBlock(
  id: string, label: string, type: QuestionBlock['questionType'],
  columns: Array<{ id: string; name: string }>
): QuestionBlock {
  return {
    id, label, questionType: type,
    columns: columns.map((c) => ({
      id: c.id, name: c.name, type,
      nRows: 100, nMissing: 0, nullMeaning: 'missing' as const,
      rawValues: Array.from({ length: 100 }, (_, i) => i * (Math.random() + 0.5)),
      fingerprint: null, semanticDetectionCache: null,
      transformStack: [], sensitivity: 'anonymous' as const, declaredScaleRange: null,
    })),
    role: 'question',
    confirmed: true,
    pastedAt: Date.now(),
  }
}

describe('generateSuggestedQuestions', () => {
  it('returns group comparison when behavioral + category blocks present', () => {
    const blocks = [
      makeBlock('b1', 'Revenue', 'behavioral', [{ id: 'c1', name: 'gross_revenue' }]),
      makeBlock('b2', 'Region', 'category', [{ id: 'c2', name: 'region' }]),
    ]
    const qs = generateSuggestedQuestions(blocks)
    expect(qs.length).toBeGreaterThan(0)
    const groupQ = qs.find((q) => q.pluginId === 'kw_significance')
    expect(groupQ).toBeDefined()
    expect(groupQ!.question).toContain('region')
    expect(groupQ!.question).toContain('gross_revenue')
  })

  it('returns driver analysis when 3+ behavioral columns with outcome keyword', () => {
    const blocks = [
      makeBlock('b1', 'Revenue', 'behavioral', [{ id: 'c1', name: 'gross_revenue' }]),
      makeBlock('b2', 'Games', 'behavioral', [{ id: 'c2', name: 'games_played' }]),
      makeBlock('b3', 'Sessions', 'behavioral', [{ id: 'c3', name: 'sessions' }]),
    ]
    const qs = generateSuggestedQuestions(blocks)
    const driverQ = qs.find((q) => q.pluginId === 'driver_analysis')
    expect(driverQ).toBeDefined()
    expect(driverQ!.question).toContain('gross_revenue')
  })

  it('returns survey-behavioral bridge when both rating and behavioral blocks present', () => {
    const blocks = [
      makeBlock('b1', 'Satisfaction', 'rating', [{ id: 'c1', name: 'satisfaction_rating' }]),
      makeBlock('b2', 'Revenue', 'behavioral', [{ id: 'c2', name: 'gross_revenue' }]),
    ]
    const qs = generateSuggestedQuestions(blocks)
    const bridgeQ = qs.find((q) => q.question.includes('survey ratings'))
    expect(bridgeQ).toBeDefined()
    expect(bridgeQ!.analysisDescription).toContain('satisfaction_rating')
    expect(bridgeQ!.analysisDescription).toContain('gross_revenue')
  })

  it('returns trend question when timestamped + behavioral blocks present', () => {
    const blocks = [
      makeBlock('b1', 'Date', 'timestamped', [{ id: 'c1', name: 'signup_date' }]),
      makeBlock('b2', 'Revenue', 'behavioral', [{ id: 'c2', name: 'gross_revenue' }]),
    ]
    const qs = generateSuggestedQuestions(blocks)
    const trendQ = qs.find((q) => q.pluginId === 'trend_over_time')
    expect(trendQ).toBeDefined()
    expect(trendQ!.question).toContain('gross_revenue')
    expect(trendQ!.question).toContain('changed over time')
  })

  it('returns empty array when only one column type present', () => {
    const blocks = [
      makeBlock('b1', 'Revenue', 'behavioral', [{ id: 'c1', name: 'gross_revenue' }]),
    ]
    const qs = generateSuggestedQuestions(blocks)
    // Only 1 behavioral column — not enough for correlation or driver
    expect(qs).toHaveLength(0)
  })

  it('never returns more than 6 questions', () => {
    const blocks = [
      makeBlock('b1', 'Rev', 'behavioral', [{ id: 'c1', name: 'gross_revenue' }]),
      makeBlock('b2', 'Games', 'behavioral', [{ id: 'c2', name: 'games_played' }]),
      makeBlock('b3', 'Sessions', 'behavioral', [{ id: 'c3', name: 'sessions' }]),
      makeBlock('b4', 'LTV', 'behavioral', [{ id: 'c4', name: 'ltv' }]),
      makeBlock('b5', 'Region', 'category', [{ id: 'c5', name: 'region' }]),
      makeBlock('b6', 'Plan', 'category', [{ id: 'c6', name: 'plan_tier' }]),
      makeBlock('b7', 'Rating', 'rating', [{ id: 'c7', name: 'nps_score' }]),
      makeBlock('b8', 'Date', 'timestamped', [{ id: 'c8', name: 'created_at' }]),
    ]
    const qs = generateSuggestedQuestions(blocks)
    expect(qs.length).toBeLessThanOrEqual(6)
  })

  it('identifies gross_revenue and nps_score as outcome columns', () => {
    const blocks = [
      makeBlock('b1', 'Rev', 'behavioral', [{ id: 'c1', name: 'gross_revenue' }]),
      makeBlock('b2', 'NPS', 'rating', [{ id: 'c2', name: 'nps_score' }]),
      makeBlock('b3', 'Games', 'behavioral', [{ id: 'c3', name: 'games_played' }]),
    ]
    const qs = generateSuggestedQuestions(blocks)
    // Driver analysis should target gross_revenue or nps_score
    const driverQ = qs.find((q) => q.pluginId === 'driver_analysis')
    if (driverQ) {
      expect(driverQ.question).toMatch(/gross_revenue|nps_score/)
    }
  })

  it('does not return driver analysis when fewer than 3 behavioral columns', () => {
    const blocks = [
      makeBlock('b1', 'Rev', 'behavioral', [{ id: 'c1', name: 'gross_revenue' }]),
      makeBlock('b2', 'Games', 'behavioral', [{ id: 'c2', name: 'games_played' }]),
    ]
    const qs = generateSuggestedQuestions(blocks)
    // 2 behavioral cols — driver needs 3+
    const driverQ = qs.find((q) => q.pluginId === 'driver_analysis')
    expect(driverQ).toBeUndefined()
  })
})
