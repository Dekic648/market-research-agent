/**
 * Row filter — applies a single filter expression to column values
 * and returns the matching row indices.
 *
 * Pure function. Used by the explorer panel only — does not affect
 * the main analysis pipeline.
 */

import type { FilterExpression } from '../stores/selectionStore'
import type { ColumnDefinition } from '../types/dataTypes'

/**
 * Apply a filter expression to a column and return matching row indices.
 * Returns all indices if filter is null.
 * Null values never match any operator.
 */
export function applyRowFilter(
  columns: ColumnDefinition[],
  filter: FilterExpression | null
): number[] {
  if (!filter) {
    // No filter — return all row indices
    const n = columns[0]?.nRows ?? 0
    return Array.from({ length: n }, (_, i) => i)
  }

  const column = columns.find((c) => c.id === filter.columnId)
  if (!column) {
    // Column not found — return all
    const n = columns[0]?.nRows ?? 0
    return Array.from({ length: n }, (_, i) => i)
  }

  const matching: number[] = []
  for (let i = 0; i < column.rawValues.length; i++) {
    const cellValue = column.rawValues[i]
    if (cellValue === null) continue // nulls never match

    if (matchesFilter(cellValue, filter.operator, filter.value)) {
      matching.push(i)
    }
  }

  return matching
}

function matchesFilter(
  cellValue: number | string,
  operator: FilterExpression['operator'],
  filterValue: string
): boolean {
  switch (operator) {
    case 'equals': {
      return String(cellValue) === filterValue
    }
    case 'not_equals': {
      return String(cellValue) !== filterValue
    }
    case 'greater_than': {
      const n = typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue))
      const fv = parseFloat(filterValue)
      if (isNaN(n) || isNaN(fv)) return false
      return n > fv
    }
    case 'less_than': {
      const n = typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue))
      const fv = parseFloat(filterValue)
      if (isNaN(n) || isNaN(fv)) return false
      return n < fv
    }
    case 'contains': {
      return String(cellValue).toLowerCase().includes(filterValue.toLowerCase())
    }
    default:
      return false
  }
}
