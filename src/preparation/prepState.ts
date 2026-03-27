/**
 * Preparation state — tracks readiness for analysis.
 *
 * "Run Analysis" button is disabled until:
 * - Missing data strategy is declared (mandatory)
 */

import type { ColumnDefinition } from '../types/dataTypes'
import type { DetectionFlag } from '../detection/types'
import type { PrepState, MissingDataStrategy } from './types'
import { computeMissingDiagnostics, littlesMCARTest } from './missingData'

/**
 * Compute the full preparation state from current data.
 */
export function computePrepState(
  columns: ColumnDefinition[],
  declaredStrategy: MissingDataStrategy | null,
  detectionFlags: DetectionFlag[]
): PrepState {
  const diagnostics = computeMissingDiagnostics(columns)
  const mcar = diagnostics.totalMissing > 0 ? littlesMCARTest(columns) : null

  const pendingFlagCount = detectionFlags.filter(
    (f) => f.type === 'reverse_coded' || f.type === 'merged_header' || f.type === 'possible_computed'
  ).length

  const activeTransformCount = columns.reduce(
    (sum, col) => sum + col.transformStack.filter((t) => t.enabled).length,
    0
  )

  return {
    missingStrategy: declaredStrategy,
    missingDiagnostics: diagnostics,
    littlesMCAR: mcar,
    pendingFlagCount,
    activeTransformCount,
    readyToAnalyze: declaredStrategy !== null,
  }
}
