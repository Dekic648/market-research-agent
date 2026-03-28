/**
 * SelectionStore — ad-hoc column selection for the variable explorer.
 *
 * Tracks which columns the researcher has picked for an exploratory analysis.
 * Scoped to the explorer panel — does not affect the main analysis flow.
 */
import { create } from 'zustand'
import { CapabilityMatcher } from '../engine/CapabilityMatcher'
import type { ColumnDefinition } from '../types/dataTypes'
import type { CapabilitySet } from '../plugins/types'

export interface FilterExpression {
  columnId: string
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains'
  value: string
}

interface SelectionStoreState {
  selectedColumns: ColumnDefinition[]
  segmentColumn: ColumnDefinition | null
  rowFilter: FilterExpression | null

  addColumn: (col: ColumnDefinition) => void
  removeColumn: (colId: string) => void
  clearSelection: () => void
  setSegment: (col: ColumnDefinition | null) => void
  setRowFilter: (filter: FilterExpression | null) => void
  clearRowFilter: () => void

  /** Reactive bridge: returns capabilities for current selection */
  getSelectionCapabilities: () => CapabilitySet

  reset: () => void
}

const initialState = {
  selectedColumns: [] as ColumnDefinition[],
  segmentColumn: null as ColumnDefinition | null,
  rowFilter: null as FilterExpression | null,
}

export const useSelectionStore = create<SelectionStoreState>()((set, get) => ({
  ...initialState,

  addColumn: (col) =>
    set((s) => {
      if (s.selectedColumns.some((c) => c.id === col.id)) return s
      return { selectedColumns: [...s.selectedColumns, col] }
    }),

  removeColumn: (colId) =>
    set((s) => ({
      selectedColumns: s.selectedColumns.filter((c) => c.id !== colId),
    })),

  clearSelection: () =>
    set({ selectedColumns: [], segmentColumn: null }),

  setSegment: (col) =>
    set({ segmentColumn: col }),

  setRowFilter: (filter) =>
    set({ rowFilter: filter }),

  clearRowFilter: () =>
    set({ rowFilter: null }),

  getSelectionCapabilities: () => {
    const { selectedColumns, segmentColumn } = get()
    if (selectedColumns.length === 0) return new Set()
    return CapabilityMatcher.resolveFromColumns(selectedColumns, segmentColumn)
  },

  reset: () => set(initialState),
}))
