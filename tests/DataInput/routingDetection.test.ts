/**
 * Routing detection integration tests — logic flow from confirmation
 * through routing source detection to subgroup creation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { detectRoutingSource } from '../../src/detection/routingDetector'
import { formatOperator } from '../../src/engine/subgroupFilter'
import { useDatasetGraphStore } from '../../src/stores/datasetGraph'
import type { ColumnDefinition, SubgroupFilter } from '../../src/types/dataTypes'

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

beforeEach(() => {
  useDatasetGraphStore.getState().reset()
})

describe('Routing detection flow', () => {
  it('after confirming conditional, detectRoutingSource runs and finds match', () => {
    const n = 100
    const sourceValues: number[] = []
    const routedValues: (number | null)[] = []
    for (let i = 0; i < n; i++) {
      const rating = (i % 5) + 1
      sourceValues.push(rating)
      routedValues.push(rating <= 3 ? 4 : null)
    }

    const sourceCol = makeCol('q1', 'Overall Rating', 'rating', sourceValues)
    const routedCol = makeCol('q2', 'Why low?', 'rating', routedValues, 'not_asked')

    const match = detectRoutingSource(routedCol, [sourceCol], n)
    expect(match).not.toBeNull()
    expect(match!.sourceColumnName).toBe('Overall Rating')
  })

  it('match contains correct operator and threshold for display', () => {
    const n = 100
    const sourceValues: number[] = []
    const routedValues: (number | null)[] = []
    for (let i = 0; i < n; i++) {
      const rating = (i % 5) + 1
      sourceValues.push(rating)
      routedValues.push(rating <= 3 ? 4 : null)
    }

    const sourceCol = makeCol('q1', 'Rating', 'rating', sourceValues)
    const routedCol = makeCol('q2', 'Follow-up', 'rating', routedValues, 'not_asked')

    const match = detectRoutingSource(routedCol, [sourceCol], n)
    expect(match).not.toBeNull()
    // formatOperator should produce readable string
    const display = formatOperator(match!.operator, match!.threshold)
    expect(display).toMatch(/[≤≥<>=]/)
    expect(match!.effectiveN).toBeGreaterThan(0)
  })

  it('apply as analysis base creates subgroup with source=auto', () => {
    const node = {
      id: 'n1', label: 'Test', rowCount: 10,
      parsedData: { groups: [{ questionType: 'rating' as const, columns: [], label: 'Test' }] },
      weights: null, readonly: false, source: 'user' as const,
      dataVersion: 1, createdAt: Date.now(), activeSubgroup: null,
    }
    useDatasetGraphStore.getState().addNode(node)

    const filter: SubgroupFilter = {
      id: 'routing_1', label: 'Respondents shown Follow-up',
      columnId: 'q1', operator: 'lte', value: 3, effectiveN: 60, source: 'auto',
    }
    useDatasetGraphStore.getState().setSubgroup('n1', filter)

    const updated = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')
    expect(updated?.activeSubgroup?.source).toBe('auto')
    expect(updated?.activeSubgroup?.label).toBe('Respondents shown Follow-up')
  })

  it('ignore does not call setSubgroup', () => {
    // Verify initial state has no subgroup
    const node = {
      id: 'n1', label: 'Test', rowCount: 10,
      parsedData: { groups: [{ questionType: 'rating' as const, columns: [], label: 'Test' }] },
      weights: null, readonly: false, source: 'user' as const,
      dataVersion: 1, createdAt: Date.now(), activeSubgroup: null,
    }
    useDatasetGraphStore.getState().addNode(node)

    // Simulating "Ignore" — just don't call setSubgroup
    const updated = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')
    expect(updated?.activeSubgroup).toBeNull()
  })

  it('when no match found (overlap < 0.85), no follow-up card data exists', () => {
    const n = 100
    const sourceValues: number[] = Array.from({ length: n }, (_, i) => (i % 5) + 1)
    // Random nulls — no correlation
    const routedValues: (number | null)[] = Array.from({ length: n }, (_, i) =>
      ((i * 7 + 3) % 11) < 4 ? null : 3
    )

    const sourceCol = makeCol('q1', 'Rating', 'rating', sourceValues)
    const routedCol = makeCol('q2', 'Follow-up', 'rating', routedValues, 'not_asked')

    const match = detectRoutingSource(routedCol, [sourceCol], n)
    expect(match).toBeNull()
    // No follow-up card would render
  })
})

describe('formatOperator', () => {
  it('lte produces ≤', () => {
    expect(formatOperator('lte', 4)).toBe('≤ 4')
  })
  it('gte produces ≥', () => {
    expect(formatOperator('gte', 5)).toBe('≥ 5')
  })
  it('eq produces =', () => {
    expect(formatOperator('eq', 3)).toBe('= 3')
  })
  it('neq produces ≠', () => {
    expect(formatOperator('neq', 0)).toBe('≠ 0')
  })
})
