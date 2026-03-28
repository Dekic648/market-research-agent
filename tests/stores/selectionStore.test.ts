/**
 * SelectionStore tests — column selection and capability resolution.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useSelectionStore } from '../../src/stores/selectionStore'
import type { ColumnDefinition } from '../../src/types/dataTypes'

function makeCol(id: string, name: string, type: ColumnDefinition['type'], values: (number | string | null)[]): ColumnDefinition {
  return {
    id, name, type,
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    rawValues: values,
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: [],
    sensitivity: 'anonymous',
    declaredScaleRange: null,
  }
}

beforeEach(() => {
  useSelectionStore.getState().reset()
})

describe('SelectionStore', () => {
  it('addColumn adds to selectedColumns', () => {
    const col = makeCol('q1', 'Satisfaction', 'rating', [1, 2, 3, 4, 5])
    useSelectionStore.getState().addColumn(col)

    const selected = useSelectionStore.getState().selectedColumns
    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe('q1')
  })

  it('addColumn does not duplicate', () => {
    const col = makeCol('q1', 'Satisfaction', 'rating', [1, 2, 3, 4, 5])
    useSelectionStore.getState().addColumn(col)
    useSelectionStore.getState().addColumn(col)

    expect(useSelectionStore.getState().selectedColumns).toHaveLength(1)
  })

  it('removeColumn removes correctly', () => {
    const col1 = makeCol('q1', 'Col 1', 'rating', [1, 2, 3])
    const col2 = makeCol('q2', 'Col 2', 'rating', [1, 2, 3])
    useSelectionStore.getState().addColumn(col1)
    useSelectionStore.getState().addColumn(col2)
    useSelectionStore.getState().removeColumn('q1')

    const selected = useSelectionStore.getState().selectedColumns
    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe('q2')
  })

  it('clearSelection empties the array', () => {
    const col = makeCol('q1', 'Col', 'rating', [1, 2, 3])
    useSelectionStore.getState().addColumn(col)
    useSelectionStore.getState().clearSelection()

    expect(useSelectionStore.getState().selectedColumns).toHaveLength(0)
    expect(useSelectionStore.getState().segmentColumn).toBeNull()
  })

  it('getSelectionCapabilities returns correct capabilities for binary + segment', () => {
    const binaryCol = makeCol('bin', 'Churned', 'checkbox', [0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0])
    const segCol = makeCol('seg', 'Region', 'category', Array.from({ length: 31 }, (_, i) => i < 15 ? 'North' : 'South'))

    useSelectionStore.getState().addColumn(binaryCol)
    useSelectionStore.getState().setSegment(segCol)

    const caps = useSelectionStore.getState().getSelectionCapabilities()
    expect(caps.has('binary')).toBe(true)
    expect(caps.has('categorical')).toBe(true)
    expect(caps.has('segment')).toBe(true)
    expect(caps.has('n>30')).toBe(true)
  })

  it('getSelectionCapabilities returns empty set for empty selection', () => {
    const caps = useSelectionStore.getState().getSelectionCapabilities()
    expect(caps.size).toBe(0)
  })

  it('setRowFilter and clearRowFilter work', () => {
    useSelectionStore.getState().setRowFilter({ columnId: 'q1', operator: 'equals', value: '5' })
    expect(useSelectionStore.getState().rowFilter).toEqual({ columnId: 'q1', operator: 'equals', value: '5' })

    useSelectionStore.getState().clearRowFilter()
    expect(useSelectionStore.getState().rowFilter).toBeNull()
  })

  it('setSegment sets and unsets segment column', () => {
    const seg = makeCol('seg', 'Region', 'category', ['A', 'B'])
    useSelectionStore.getState().setSegment(seg)
    expect(useSelectionStore.getState().segmentColumn?.id).toBe('seg')

    useSelectionStore.getState().setSegment(null)
    expect(useSelectionStore.getState().segmentColumn).toBeNull()
  })
})
