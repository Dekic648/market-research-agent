/**
 * Subgroup filter — computes matching row indices for a SubgroupFilter.
 * Pure function. Used by runners to filter data before plugin execution.
 */

import type { SubgroupFilter, ColumnDefinition } from '../types/dataTypes'
import { resolveColumn } from './resolveColumn'

/**
 * Returns the row indices that match the subgroup filter condition.
 * If filter is null, returns all indices.
 */
export function computeSubgroupIndices(
  filter: SubgroupFilter | null,
  allColumns: ColumnDefinition[]
): number[] {
  if (!filter) {
    const n = allColumns[0]?.nRows ?? 0
    return Array.from({ length: n }, (_, i) => i)
  }

  const col = allColumns.find((c) => c.id === filter.columnId)
  if (!col) {
    const n = allColumns[0]?.nRows ?? 0
    return Array.from({ length: n }, (_, i) => i)
  }

  const values = resolveColumn(col)
  const matching: number[] = []

  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === null) continue
    if (matchesCondition(v, filter.operator, filter.value)) {
      matching.push(i)
    }
  }

  return matching
}

function matchesCondition(
  cellValue: number | string,
  operator: SubgroupFilter['operator'],
  filterValue: SubgroupFilter['value']
): boolean {
  const n = typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue))
  const isNumeric = !isNaN(n)

  switch (operator) {
    case 'eq':
      return String(cellValue) === String(filterValue)
    case 'neq':
      return String(cellValue) !== String(filterValue)
    case 'gt':
      return isNumeric && n > Number(filterValue)
    case 'gte':
      return isNumeric && n >= Number(filterValue)
    case 'lt':
      return isNumeric && n < Number(filterValue)
    case 'lte':
      return isNumeric && n <= Number(filterValue)
    case 'in': {
      const arr = Array.isArray(filterValue) ? filterValue : [filterValue]
      return arr.some((fv) => String(cellValue) === String(fv))
    }
    default:
      return false
  }
}

/**
 * Format operator + threshold for display.
 */
export function formatOperator(operator: string, threshold: number | string): string {
  switch (operator) {
    case 'lte': return `\u2264 ${threshold}`
    case 'gte': return `\u2265 ${threshold}`
    case 'lt':  return `< ${threshold}`
    case 'gt':  return `> ${threshold}`
    case 'eq':  return `= ${threshold}`
    case 'neq': return `\u2260 ${threshold}`
    default:    return `${operator} ${threshold}`
  }
}

/**
 * Compute effectiveN for a SubgroupFilter at creation time.
 */
export function computeEffectiveN(
  filter: Omit<SubgroupFilter, 'effectiveN'>,
  allColumns: ColumnDefinition[]
): number {
  const indices = computeSubgroupIndices(
    { ...filter, effectiveN: 0 } as SubgroupFilter,
    allColumns
  )
  return indices.length
}
