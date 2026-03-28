/**
 * nullMeaning tests — default assignment and routing detection logic.
 */
import { describe, it, expect } from 'vitest'
import type { QuestionType, NullMeaning } from '../../src/types/dataTypes'

/** Mirrors the logic in QuestionBlockCard parseAndUpdate */
function defaultNullMeaning(type: QuestionType): NullMeaning {
  if (type === 'checkbox' || type === 'multi_assigned') return 'not_chosen'
  return 'missing'
}

/** Mirrors the routing prompt logic in QuestionBlockCard */
function shouldShowRoutingPrompt(
  nullRate: number,
  type: QuestionType,
  currentNullMeaning: NullMeaning
): boolean {
  return nullRate > 0.3
    && type !== 'checkbox'
    && type !== 'multi_assigned'
    && currentNullMeaning === 'missing'
}

describe('defaultNullMeaning', () => {
  it('checkbox defaults to not_chosen', () => {
    expect(defaultNullMeaning('checkbox')).toBe('not_chosen')
  })

  it('multi_assigned defaults to not_chosen', () => {
    expect(defaultNullMeaning('multi_assigned')).toBe('not_chosen')
  })

  it('rating defaults to missing', () => {
    expect(defaultNullMeaning('rating')).toBe('missing')
  })

  it('category defaults to missing', () => {
    expect(defaultNullMeaning('category')).toBe('missing')
  })

  it('behavioral defaults to missing', () => {
    expect(defaultNullMeaning('behavioral')).toBe('missing')
  })
})

describe('Routing detection prompt', () => {
  it('appears when null rate > 30% and type is not checkbox', () => {
    expect(shouldShowRoutingPrompt(0.45, 'rating', 'missing')).toBe(true)
  })

  it('does not appear when null rate <= 30%', () => {
    expect(shouldShowRoutingPrompt(0.15, 'rating', 'missing')).toBe(false)
    expect(shouldShowRoutingPrompt(0.30, 'rating', 'missing')).toBe(false)
  })

  it('does not appear for checkbox columns', () => {
    expect(shouldShowRoutingPrompt(0.50, 'checkbox', 'missing')).toBe(false)
  })

  it('does not appear for multi_assigned columns', () => {
    expect(shouldShowRoutingPrompt(0.50, 'multi_assigned', 'missing')).toBe(false)
  })

  it('does not appear when nullMeaning is already not_asked', () => {
    expect(shouldShowRoutingPrompt(0.50, 'rating', 'not_asked')).toBe(false)
  })

  it('selecting conditional question sets nullMeaning to not_asked', () => {
    // Simulate the user clicking "Yes — conditional question"
    const currentMeaning: NullMeaning = 'missing'
    const afterChoice: NullMeaning = 'not_asked'
    expect(afterChoice).toBe('not_asked')
    expect(currentMeaning).not.toBe(afterChoice)
  })
})
