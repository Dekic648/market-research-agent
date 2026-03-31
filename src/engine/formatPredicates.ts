/**
 * Format predicates — type-safe column classification for analysis routing.
 *
 * Use these instead of the catch-all isSurveyFormat() when the analysis
 * requires a specific data shape (ordinal, categorical, binary, multi-response).
 */

import type { ColumnDefinition } from '../types/dataTypes'

/** Ordinal scale — can compute mean, correlation, regression. */
export function isOrdinalFormat(col: ColumnDefinition): boolean {
  return col.format === 'rating'
    || col.format === 'matrix'
    || (col.format === 'radio' && col.statisticalType === 'ordinal')
}

/** Categorical — unordered labels. Chi-square eligible, not correlation. */
export function isCategoricalFormat(col: ColumnDefinition): boolean {
  return col.format === 'radio' || col.format === 'category'
}

/** Binary — 0/1 or yes/no. Logistic regression outcome, point-biserial. */
export function isBinaryFormat(col: ColumnDefinition): boolean {
  return col.format === 'checkbox' || col.statisticalType === 'binary'
}

/** Multi-response (checkbox grid) — per-option selected/not-selected. */
export function isMultiResponseFormat(col: ColumnDefinition): boolean {
  return col.format === 'multi_response'
}
