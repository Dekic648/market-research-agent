/**
 * Subgroup filter tests — store actions and row index computation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useDatasetGraphStore } from '../../src/stores/datasetGraph'
import { computeSubgroupIndices, computeEffectiveN } from '../../src/engine/subgroupFilter'
import type { ColumnDefinition, SubgroupFilter } from '../../src/types/dataTypes'

function makeCol(id: string, name: string, type: ColumnDefinition['type'], values: (number | string | null)[]): ColumnDefinition {
  return {
    id, name, type,
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    nullMeaning: 'missing',
    rawValues: values,
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: [],
    sensitivity: 'anonymous',
    declaredScaleRange: null,
  }
}

function makeNode(id: string, columns: ColumnDefinition[]) {
  return {
    id, label: 'Test', rowCount: columns[0]?.nRows ?? 0,
    parsedData: { groups: [{ questionType: columns[0]?.type ?? 'rating' as const, columns, label: 'Test' }] },
    weights: null, readonly: false, source: 'user' as const,
    dataVersion: 1, createdAt: Date.now(), activeSubgroup: null,
  }
}

beforeEach(() => {
  useDatasetGraphStore.getState().reset()
})

describe('Subgroup store actions', () => {
  it('setSubgroup sets activeSubgroup on the node', () => {
    const col = makeCol('q1', 'Rating', 'rating', [1, 2, 3, 4, 5])
    const node = makeNode('n1', [col])
    useDatasetGraphStore.getState().addNode(node)

    const filter: SubgroupFilter = {
      id: 'sg1', label: 'Low Raters', columnId: 'q1',
      operator: 'lte', value: 3, effectiveN: 3, source: 'manual',
    }
    useDatasetGraphStore.getState().setSubgroup('n1', filter)

    const updated = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')
    expect(updated?.activeSubgroup).toBeDefined()
    expect(updated?.activeSubgroup?.label).toBe('Low Raters')
    expect(updated?.activeSubgroup?.effectiveN).toBe(3)
  })

  it('clearSubgroup resets to null', () => {
    const col = makeCol('q1', 'Rating', 'rating', [1, 2, 3, 4, 5])
    const node = makeNode('n1', [col])
    useDatasetGraphStore.getState().addNode(node)

    const filter: SubgroupFilter = {
      id: 'sg1', label: 'Test', columnId: 'q1',
      operator: 'lte', value: 3, effectiveN: 3, source: 'manual',
    }
    useDatasetGraphStore.getState().setSubgroup('n1', filter)
    useDatasetGraphStore.getState().clearSubgroup('n1')

    const updated = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')
    expect(updated?.activeSubgroup).toBeNull()
  })
})

describe('computeSubgroupIndices', () => {
  it('lte condition returns correct indices', () => {
    const col = makeCol('q1', 'NPS', 'rating', [1, 5, 3, 8, 2, 9, 4])
    const filter: SubgroupFilter = {
      id: 'sg1', label: 'Detractors', columnId: 'q1',
      operator: 'lte', value: 4, effectiveN: 0, source: 'manual',
    }
    const indices = computeSubgroupIndices(filter, [col])
    expect(indices).toEqual([0, 2, 4, 6]) // values 1, 3, 2, 4
  })

  it('eq condition works for string values', () => {
    const col = makeCol('seg', 'Region', 'category', ['North', 'South', 'North', 'East'])
    const filter: SubgroupFilter = {
      id: 'sg1', label: 'North', columnId: 'seg',
      operator: 'eq', value: 'North', effectiveN: 0, source: 'manual',
    }
    const indices = computeSubgroupIndices(filter, [col])
    expect(indices).toEqual([0, 2])
  })

  it('null filter returns all indices', () => {
    const col = makeCol('q1', 'Rating', 'rating', [1, 2, 3])
    const indices = computeSubgroupIndices(null, [col])
    expect(indices).toEqual([0, 1, 2])
  })

  it('nulls in the filter column are excluded', () => {
    const col = makeCol('q1', 'Rating', 'rating', [1, null, 3, null, 5])
    const filter: SubgroupFilter = {
      id: 'sg1', label: 'High', columnId: 'q1',
      operator: 'gte', value: 1, effectiveN: 0, source: 'manual',
    }
    const indices = computeSubgroupIndices(filter, [col])
    expect(indices).toEqual([0, 2, 4]) // nulls skipped
  })
})

describe('SubgroupFilter source field', () => {
  it('auto source is preserved on the node', () => {
    const col = makeCol('q1', 'Rating', 'rating', [1, 2, 3, 4, 5])
    const node = makeNode('n1', [col])
    useDatasetGraphStore.getState().addNode(node)

    const filter: SubgroupFilter = {
      id: 'sg1', label: 'Auto Subgroup', columnId: 'q1',
      operator: 'lte', value: 3, effectiveN: 3, source: 'auto',
    }
    useDatasetGraphStore.getState().setSubgroup('n1', filter)

    const updated = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')
    expect(updated?.activeSubgroup?.source).toBe('auto')
  })

  it('manual source is preserved on the node', () => {
    const col = makeCol('q1', 'Rating', 'rating', [1, 2, 3, 4, 5])
    const node = makeNode('n1', [col])
    useDatasetGraphStore.getState().addNode(node)

    const filter: SubgroupFilter = {
      id: 'sg1', label: 'Manual Subgroup', columnId: 'q1',
      operator: 'gte', value: 4, effectiveN: 2, source: 'manual',
    }
    useDatasetGraphStore.getState().setSubgroup('n1', filter)

    const updated = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')
    expect(updated?.activeSubgroup?.source).toBe('manual')
  })
})

describe('computeEffectiveN', () => {
  it('computes correct count for lte', () => {
    const col = makeCol('q1', 'NPS', 'rating', [1, 5, 3, 8, 2, 9, 4, 10])
    const n = computeEffectiveN(
      { id: '', label: '', columnId: 'q1', operator: 'lte', value: 4 },
      [col]
    )
    expect(n).toBe(4) // 1, 3, 2, 4
  })
})

describe('applyImputation', () => {
  it('sets imputedValues on the correct columns', () => {
    const col1 = makeCol('q1', 'Rating', 'rating', [1, null, 3, null, 5])
    const col2 = makeCol('q2', 'Trust', 'rating', [4, 3, 5, 2, 1])
    const node = makeNode('n1', [col1, col2])
    useDatasetGraphStore.getState().addNode(node)

    const imputedCols = new Map<string, (number | string | null)[]>()
    imputedCols.set('q1', [1, 2, 3, 4, 5])

    useDatasetGraphStore.getState().applyImputation('n1', imputedCols)

    const updated = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')
    const updatedCol1 = updated?.parsedData.groups[0].columns.find((c) => c.id === 'q1')
    const updatedCol2 = updated?.parsedData.groups[0].columns.find((c) => c.id === 'q2')

    expect(updatedCol1?.imputedValues).toEqual([1, 2, 3, 4, 5])
    expect(updatedCol2?.imputedValues).toBeUndefined()
  })

  it('increments dataVersion', () => {
    const col = makeCol('q1', 'Rating', 'rating', [1, null, 3])
    const node = makeNode('n1', [col])
    useDatasetGraphStore.getState().addNode(node)

    const before = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')?.dataVersion

    useDatasetGraphStore.getState().applyImputation('n1', new Map([['q1', [1, 2, 3]]]))

    const after = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')?.dataVersion
    expect(after).toBe((before ?? 0) + 1)
  })

  it('columns not in the result are unchanged', () => {
    const col1 = makeCol('q1', 'Rating', 'rating', [1, null, 3])
    const col2 = makeCol('q2', 'Other', 'rating', [4, 5, 6])
    const node = makeNode('n1', [col1, col2])
    useDatasetGraphStore.getState().addNode(node)

    useDatasetGraphStore.getState().applyImputation('n1', new Map([['q1', [1, 2, 3]]]))

    const updated = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')
    const updatedCol2 = updated?.parsedData.groups[0].columns.find((c) => c.id === 'q2')
    expect(updatedCol2?.rawValues).toEqual([4, 5, 6])
    expect(updatedCol2?.imputedValues).toBeUndefined()
  })
})

describe('setComputedWeights', () => {
  it('creates a synthetic weight column and sets it as DatasetNode.weights', () => {
    const col = makeCol('q1', 'Rating', 'rating', [1, 2, 3, 4, 5])
    const node = makeNode('n1', [col])
    useDatasetGraphStore.getState().addNode(node)

    useDatasetGraphStore.getState().setComputedWeights('n1', [1.2, 0.8, 1.5, 0.9, 1.1], 'Weights — Region')

    const updated = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')
    expect(updated?.weights).toBeDefined()
    expect(updated?.weights?.name).toBe('Weights — Region')
    expect(updated?.weights?.type).toBe('weight')
    expect(updated?.weights?.rawValues).toEqual([1.2, 0.8, 1.5, 0.9, 1.1])
  })

  it('increments dataVersion', () => {
    const col = makeCol('q1', 'Rating', 'rating', [1, 2, 3])
    const node = makeNode('n1', [col])
    useDatasetGraphStore.getState().addNode(node)

    const before = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')?.dataVersion

    useDatasetGraphStore.getState().setComputedWeights('n1', [1.0, 1.0, 1.0], 'Weights')

    const after = useDatasetGraphStore.getState().nodes.find((n) => n.id === 'n1')?.dataVersion
    expect(after).toBe((before ?? 0) + 1)
  })
})
