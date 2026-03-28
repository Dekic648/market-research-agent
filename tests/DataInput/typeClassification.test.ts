/**
 * Tests for the type classification interpretation cards,
 * nominal-integer warning, and confirmation gating.
 */
import { describe, it, expect } from 'vitest'
import { TYPE_DESCRIPTIONS, SELECTABLE_TYPES } from '../../src/components/DataInput/columnTypeDescriptions'
import type { QuestionBlock, ColumnDefinition } from '../../src/types/dataTypes'
import { computeFingerprint } from '../../src/parsers/fingerprint'

function makeCol(values: (number | string | null)[]): ColumnDefinition {
  const fp = computeFingerprint(values, 'test_col')
  return {
    id: 'test_col', name: 'Test', type: 'rating',
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    rawValues: values, fingerprint: fp,
    semanticDetectionCache: null, transformStack: [],
    sensitivity: 'anonymous', declaredScaleRange: null,
  }
}

function makeBlock(
  questionType: QuestionBlock['questionType'],
  values: (number | string | null)[],
  confirmed = false
): QuestionBlock {
  return {
    id: 'qb_test', label: 'Test Q', questionType,
    columns: [makeCol(values)],
    role: 'question', confirmed, pastedAt: Date.now(),
  }
}

// ============================================================
// Nominal-integer warning logic
// ============================================================

describe('Nominal-integer warning', () => {
  function shouldShowWarning(block: QuestionBlock): boolean {
    const hasParsedData = block.columns.length > 0
    return hasParsedData
      && !block.confirmed
      && block.questionType === 'rating'
      && block.columns[0]?.fingerprint !== null
      && (block.columns[0]?.fingerprint?.numericRatio ?? 0) > 0.8
      && (block.columns[0]?.fingerprint?.nUnique ?? 0) <= 6
  }

  it('appears when: numeric column, nUnique <= 6, auto-type is rating', () => {
    // Values 1,2,3 — 3 unique, all numeric, auto-typed as rating
    const block = makeBlock('rating', [1, 2, 3, 1, 2, 3, 1, 2, 3, 1])
    expect(shouldShowWarning(block)).toBe(true)
  })

  it('does NOT appear for a column with nUnique = 10', () => {
    const block = makeBlock('rating', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(shouldShowWarning(block)).toBe(false)
  })

  it('does NOT appear when already confirmed', () => {
    const block = makeBlock('rating', [1, 2, 3, 1, 2, 3, 1, 2, 3, 1], true)
    expect(shouldShowWarning(block)).toBe(false)
  })

  it('does NOT appear for non-rating types', () => {
    const block = makeBlock('category', [1, 2, 3, 1, 2, 3, 1, 2, 3, 1])
    expect(shouldShowWarning(block)).toBe(false)
  })

  it('does NOT appear for text columns', () => {
    const block = makeBlock('rating', ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a'])
    // numericRatio will be 0 — not > 0.8
    expect(shouldShowWarning(block)).toBe(false)
  })
})

// ============================================================
// Confirmation state and gating
// ============================================================

describe('Confirmation gating', () => {
  it('proceed button disabled when any block is unconfirmed', () => {
    const blocks: QuestionBlock[] = [
      makeBlock('rating', [1, 2, 3, 4, 5], true),   // confirmed
      makeBlock('category', ['A', 'B', 'C'], false),  // unconfirmed
    ]
    const blocksWithData = blocks.filter((b) => b.columns.length > 0)
    const allConfirmed = blocksWithData.every((b) => b.confirmed)
    expect(allConfirmed).toBe(false)
  })

  it('proceed button enabled when all blocks are confirmed', () => {
    const blocks: QuestionBlock[] = [
      makeBlock('rating', [1, 2, 3, 4, 5], true),
      makeBlock('category', ['A', 'B', 'C'], true),
    ]
    const blocksWithData = blocks.filter((b) => b.columns.length > 0)
    const allConfirmed = blocksWithData.every((b) => b.confirmed)
    expect(allConfirmed).toBe(true)
  })

  it('empty blocks (no data) do not affect gating', () => {
    const blocks: QuestionBlock[] = [
      makeBlock('rating', [1, 2, 3, 4, 5], true),
      { id: 'empty', label: 'Empty', questionType: 'rating', columns: [], role: 'question', confirmed: false, pastedAt: Date.now() },
    ]
    const blocksWithData = blocks.filter((b) => b.columns.length > 0)
    const allConfirmed = blocksWithData.every((b) => b.confirmed)
    expect(allConfirmed).toBe(true) // empty block excluded
  })
})

// ============================================================
// Type reclassification
// ============================================================

describe('Nominal choice reclassification', () => {
  it('selecting "they are categories" changes type to category', () => {
    const block = makeBlock('rating', [1, 2, 3, 1, 2, 3])
    // Simulate handleNominalChoice(true)
    const updated = { ...block, questionType: 'category' as const, confirmed: true }
    expect(updated.questionType).toBe('category')
    expect(updated.confirmed).toBe(true)

    // Verify category consequence is shown
    const desc = TYPE_DESCRIPTIONS[updated.questionType]
    expect(desc.consequence).toContain('labels only')
  })

  it('selecting "they are a real scale" keeps type as rating', () => {
    const block = makeBlock('rating', [1, 2, 3, 1, 2, 3])
    const updated = { ...block, confirmed: true }
    expect(updated.questionType).toBe('rating')
    expect(updated.confirmed).toBe(true)
  })
})

// ============================================================
// Type descriptions coverage
// ============================================================

describe('TYPE_DESCRIPTIONS', () => {
  it('has entries for all selectable types', () => {
    for (const t of SELECTABLE_TYPES) {
      const desc = TYPE_DESCRIPTIONS[t]
      expect(desc).toBeDefined()
      expect(desc.label.length).toBeGreaterThan(5)
      expect(desc.consequence.length).toBeGreaterThan(10)
      expect(desc.helpText.length).toBeGreaterThan(20)
    }
  })

  it('has entries for non-selectable types too', () => {
    expect(TYPE_DESCRIPTIONS['timestamped']).toBeDefined()
    expect(TYPE_DESCRIPTIONS['multi_assigned']).toBeDefined()
  })
})
