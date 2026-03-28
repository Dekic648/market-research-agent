/**
 * Routing correlation detector — identifies when a conditional question's
 * null pattern is caused by a filter condition on another column.
 *
 * Pure function. Runs at tagging time, not analysis time.
 */

import type { ColumnDefinition } from '../types/dataTypes'
import { resolveColumn } from '../engine/resolveColumn'

export interface RoutingMatch {
  sourceColumnId: string
  sourceColumnName: string
  operator: 'lte' | 'gte' | 'lt' | 'gt' | 'eq'
  threshold: number
  overlapPct: number        // 0–1, Jaccard similarity between predicted and actual asked sets
  suggestedLabel: string    // e.g. "Respondents shown [columnName]"
  effectiveN: number        // number of rows matching the condition
}

const MIN_OVERLAP = 0.85
const MAX_UNIQUE_VALUES = 20

type Operator = RoutingMatch['operator']

/**
 * Detect whether the null pattern in routedColumn can be predicted by
 * a threshold condition on another column.
 *
 * Returns the best match if Jaccard overlap >= 0.85, else null.
 */
export function detectRoutingSource(
  routedColumn: ColumnDefinition,
  allColumns: ColumnDefinition[],
  rowCount: number
): RoutingMatch | null {
  const routedValues = resolveColumn(routedColumn)
  const n = routedValues.length

  // Build the "asked" set: rows where routedColumn has a value (non-null)
  const askedSet = new Set<number>()
  for (let i = 0; i < n; i++) {
    if (routedValues[i] !== null) askedSet.add(i)
  }

  if (askedSet.size === 0 || askedSet.size === n) return null // all null or no null — nothing to detect

  let bestMatch: RoutingMatch | null = null
  let bestOverlap = 0

  // Candidate columns: numeric, not self, not verbatim/timestamped, <= 20 unique values
  const candidates = allColumns.filter((c) => {
    if (c.id === routedColumn.id) return false
    if (c.type === 'verbatim' || c.type === 'timestamped') return false
    return true
  })

  for (const candidate of candidates) {
    const candValues = resolveColumn(candidate)

    // Extract unique numeric values
    const uniqueNums = new Set<number>()
    for (let i = 0; i < candValues.length; i++) {
      const v = candValues[i]
      if (v === null) continue
      const num = typeof v === 'number' ? v : parseFloat(String(v))
      if (!isNaN(num)) uniqueNums.add(num)
    }

    if (uniqueNums.size === 0 || uniqueNums.size > MAX_UNIQUE_VALUES) continue

    const thresholds = Array.from(uniqueNums).sort((a, b) => a - b)
    const operators: Operator[] = ['lte', 'gte', 'eq']

    for (const op of operators) {
      for (const threshold of thresholds) {
        // Build predicted "asked" set: rows where condition is TRUE
        const predictedAsked = new Set<number>()
        for (let i = 0; i < candValues.length; i++) {
          const v = candValues[i]
          if (v === null) continue
          const num = typeof v === 'number' ? v : parseFloat(String(v))
          if (isNaN(num)) continue
          if (evalOp(num, op, threshold)) predictedAsked.add(i)
        }

        if (predictedAsked.size === 0) continue

        // Jaccard: |intersection| / |union|
        let intersection = 0
        for (const idx of predictedAsked) {
          if (askedSet.has(idx)) intersection++
        }
        const union = new Set([...predictedAsked, ...askedSet]).size
        const overlap = union > 0 ? intersection / union : 0

        if (overlap > bestOverlap) {
          bestOverlap = overlap
          bestMatch = {
            sourceColumnId: candidate.id,
            sourceColumnName: candidate.name,
            operator: op,
            threshold,
            overlapPct: overlap,
            suggestedLabel: `Respondents shown ${routedColumn.name}`,
            effectiveN: predictedAsked.size,
          }
        }
      }
    }
  }

  if (bestMatch && bestOverlap >= MIN_OVERLAP) return bestMatch
  return null
}

function evalOp(value: number, op: Operator, threshold: number): boolean {
  switch (op) {
    case 'lte': return value <= threshold
    case 'gte': return value >= threshold
    case 'lt': return value < threshold
    case 'gt': return value > threshold
    case 'eq': return value === threshold
    default: return false
  }
}
