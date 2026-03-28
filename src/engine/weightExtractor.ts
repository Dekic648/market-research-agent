/**
 * Weight extraction and validation utility.
 * Used by both HeadlessRunner and InteractiveRunner.
 */

import type { ColumnDefinition, AnalysisLogEntry } from '../types/dataTypes'
import { resolveColumn } from './resolveColumn'

export interface WeightExtractionResult {
  weights: number[] | undefined
  weightColumnName: string | undefined
  logEntry: Partial<AnalysisLogEntry> | null
}

/**
 * Extract and validate weights from a weight ColumnDefinition.
 * Returns validated weights array, or undefined if invalid/absent.
 */
export function extractWeights(
  weightColumn: ColumnDefinition | null | undefined,
  rowCount: number,
  userId: string,
  dataFingerprint: string,
  dataVersion: number,
  sessionId: string
): WeightExtractionResult {
  if (!weightColumn) {
    return { weights: undefined, weightColumnName: undefined, logEntry: null }
  }

  const resolved = resolveColumn(weightColumn)
  const isValid = resolved.length === rowCount &&
    resolved.every((v) => typeof v === 'number' && v > 0 && isFinite(v))

  if (!isValid) {
    return {
      weights: undefined,
      weightColumnName: undefined,
      logEntry: {
        type: 'weight_validation_failed',
        userId,
        dataFingerprint,
        dataVersion,
        sessionId,
        payload: {
          reason: 'Weights contain invalid values (non-positive, non-finite, or wrong length) — running unweighted',
          columnName: weightColumn.name,
          columnId: weightColumn.id,
          expectedLength: rowCount,
          actualLength: resolved.length,
        },
      },
    }
  }

  return {
    weights: resolved as number[],
    weightColumnName: weightColumn.name,
    logEntry: null,
  }
}
