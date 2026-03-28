/**
 * Routing correlation detector tests — detectRoutingSource().
 */
import { describe, it, expect } from 'vitest'
import { detectRoutingSource } from '../../src/detection/routingDetector'
import type { ColumnDefinition } from '../../src/types/dataTypes'

function makeCol(
  id: string, name: string, type: ColumnDefinition['type'],
  values: (number | string | null)[],
  nullMeaning: 'missing' | 'not_asked' | 'not_chosen' = 'missing'
): ColumnDefinition {
  return {
    id, name, type,
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    nullMeaning,
    rawValues: values,
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: [],
    sensitivity: 'anonymous',
    declaredScaleRange: null,
  }
}

describe('detectRoutingSource', () => {
  it('detects perfect routing: nulls correspond exactly to rows where source > 4', () => {
    const n = 100
    const sourceValues: number[] = []
    const routedValues: (number | null)[] = []

    for (let i = 0; i < n; i++) {
      const rating = (i % 5) + 1 // cycles 1,2,3,4,5
      sourceValues.push(rating)
      // Only respondents who rated <= 4 see the follow-up
      routedValues.push(rating <= 4 ? 3 + Math.random() : null)
    }

    const sourceCol = makeCol('q1', 'Overall Rating', 'rating', sourceValues)
    const routedCol = makeCol('q2', 'Why low rating?', 'rating', routedValues, 'not_asked')

    const match = detectRoutingSource(routedCol, [sourceCol, routedCol], n)
    expect(match).not.toBeNull()
    expect(match!.sourceColumnId).toBe('q1')
    expect(match!.overlapPct).toBeGreaterThanOrEqual(0.85)
    // Should find lte 4 or gte 5 as the best operator/threshold
    expect(['lte', 'gte', 'eq']).toContain(match!.operator)
  })

  it('returns null when nulls are random (not correlated)', () => {
    const n = 200
    const sourceValues: number[] = []
    const routedValues: (number | null)[] = []

    // Seed a deterministic-ish random pattern
    for (let i = 0; i < n; i++) {
      sourceValues.push((i % 5) + 1)
      // Random nulls — not related to source at all
      routedValues.push(((i * 7 + 3) % 11) < 4 ? null : 3)
    }

    const sourceCol = makeCol('q1', 'Rating', 'rating', sourceValues)
    const routedCol = makeCol('q2', 'Comment', 'rating', routedValues, 'not_asked')

    const match = detectRoutingSource(routedCol, [sourceCol, routedCol], n)
    expect(match).toBeNull()
  })

  it('detects routing with ~95% match: lte threshold 3 with 5% noise', () => {
    const n = 200
    const sourceValues: number[] = []
    const routedValues: (number | null)[] = []

    for (let i = 0; i < n; i++) {
      const rating = (i % 5) + 1
      sourceValues.push(rating)
      if (rating <= 3) {
        // 95% asked, 5% noise
        routedValues.push(i % 20 === 0 ? null : 4)
      } else {
        // 95% not asked, 5% noise
        routedValues.push(i % 20 === 0 ? 4 : null)
      }
    }

    const sourceCol = makeCol('q1', 'Satisfaction', 'rating', sourceValues)
    const routedCol = makeCol('q2', 'Improvement', 'rating', routedValues, 'not_asked')

    const match = detectRoutingSource(routedCol, [sourceCol, routedCol], n)
    expect(match).not.toBeNull()
    expect(match!.overlapPct).toBeGreaterThanOrEqual(0.85)
  })

  it('skips columns with > 20 unique values', () => {
    const n = 100
    // Source has 50 unique values — should be skipped
    const sourceValues = Array.from({ length: n }, (_, i) => i * 1.5)
    const routedValues: (number | null)[] = Array.from({ length: n }, (_, i) => i < 50 ? 3 : null)

    const sourceCol = makeCol('q1', 'Score', 'behavioral', sourceValues)
    const routedCol = makeCol('q2', 'Follow-up', 'rating', routedValues, 'not_asked')

    const match = detectRoutingSource(routedCol, [sourceCol], n)
    expect(match).toBeNull()
  })

  it('skips verbatim and timestamped columns as candidates', () => {
    const n = 50
    const verbatimCol = makeCol('v1', 'Comment', 'verbatim',
      Array.from({ length: n }, (_, i) => i < 25 ? 'text' : null))
    const tsCol = makeCol('t1', 'Created', 'timestamped',
      Array.from({ length: n }, (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`))
    const routedCol = makeCol('q2', 'Follow-up', 'rating',
      Array.from({ length: n }, (_, i) => i < 25 ? 3 : null), 'not_asked')

    const match = detectRoutingSource(routedCol, [verbatimCol, tsCol], n)
    expect(match).toBeNull()
  })

  it('returns null with only one column (no candidates)', () => {
    const routedCol = makeCol('q1', 'Question', 'rating', [1, null, 3, null, 5], 'not_asked')
    const match = detectRoutingSource(routedCol, [routedCol], 5)
    expect(match).toBeNull()
  })

  it('overlap of exactly 0.85 returns a match (boundary inclusive)', () => {
    // Build a dataset where Jaccard = exactly 0.85
    // Jaccard = intersection / union = 0.85
    // If asked = 85 rows, predicted = 100 rows, intersection = 85:
    //   union = 100, Jaccard = 85/100 = 0.85
    const n = 100
    const sourceValues: number[] = Array.from({ length: n }, (_, i) => i < 100 ? 1 : 2)
    // Routed: first 85 asked, last 15 null
    const routedValues: (number | null)[] = Array.from({ length: n }, (_, i) => i < 85 ? 3 : null)

    const sourceCol = makeCol('q1', 'Rating', 'rating', sourceValues)
    const routedCol = makeCol('q2', 'Detail', 'rating', routedValues, 'not_asked')

    // Source has only 1 unique value (all 1s), so eq=1 predicts all 100 rows as "asked"
    // Actual asked = 85, predicted asked = 100
    // Intersection = 85, union = 100, Jaccard = 0.85 — exactly at boundary
    const match = detectRoutingSource(routedCol, [sourceCol], n)
    expect(match).not.toBeNull()
    expect(match!.overlapPct).toBeCloseTo(0.85, 2)
  })

  it('overlap of 0.84 returns null (below threshold)', () => {
    const n = 100
    const sourceValues: number[] = Array.from({ length: n }, () => 1)
    // Routed: first 84 asked, last 16 null
    const routedValues: (number | null)[] = Array.from({ length: n }, (_, i) => i < 84 ? 3 : null)

    const sourceCol = makeCol('q1', 'Rating', 'rating', sourceValues)
    const routedCol = makeCol('q2', 'Detail', 'rating', routedValues, 'not_asked')

    // eq=1 predicts all 100, actual 84: Jaccard = 84/100 = 0.84
    const match = detectRoutingSource(routedCol, [sourceCol], n)
    expect(match).toBeNull()
  })
})
