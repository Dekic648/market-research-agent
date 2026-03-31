/**
 * inferColumnType — per-column type detection for mixed-type blocks.
 *
 * Used when a segment or behavioral block contains multiple columns that may be
 * a mix of categorical and continuous. Each column is typed individually.
 *
 * Also exports isAlchemerCheckboxColumn() for Alchemer checkbox grid detection.
 *
 * Detection rules (in priority order):
 *   1. Alchemer checkbox pattern → 'multi_response'
 *   2. If >70% of string values match a prefixed ordinal pattern → 'category'
 *   3. If numericRatio > 0.8 and nUnique > 10 → 'behavioral' (continuous)
 *   4. If numericRatio > 0.8 and nUnique <= 10 → 'rating' (ordinal scale)
 *   5. If numericRatio < 0.2 → 'category'
 *   6. Fallback → 'category'
 */

import type { QuestionType, ColumnFingerprint } from '../../types/dataTypes'

const PREFIX_PATTERN = /^\d+[)_]\s*/

/**
 * Detect whether a single column matches the Alchemer checkbox pattern:
 *   - High null ratio (> 40%)
 *   - All non-null values are the same integer (the option code)
 *   - Column name ends with _N pattern (e.g. Q12_1, Feature_3)
 */
export function isAlchemerCheckboxColumn(
  values: (number | string | null)[],
  fingerprint: ColumnFingerprint,
  columnName: string
): boolean {
  const nullCount = values.filter((v) => v === null).length
  const nullRatio = values.length > 0 ? nullCount / values.length : 0

  // Must have > 40% nulls — most respondents don't pick every option
  if (nullRatio < 0.1) return false

  // All non-null values must be numeric integers
  const nonNull: number[] = []
  for (const v of values) {
    if (v === null) continue
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (isNaN(n) || !Number.isInteger(n)) return false
    nonNull.push(n)
  }

  if (nonNull.length === 0) return false

  // All non-null values should be the same number (the option code)
  const uniqueNonNull = new Set(nonNull)
  if (uniqueNonNull.size <= 2) {
    return true
  }

  // Fallback: column name ends with _N pattern
  if (/[_]\d+$/.test(columnName) && uniqueNonNull.size <= 3) {
    return true
  }

  return false
}

/**
 * Detect whether a set of columns form an Alchemer checkbox grid:
 *   - 3+ columns all matching isAlchemerCheckboxColumn
 *   - Column names share a common prefix
 */
export function isAlchemerCheckboxGrid(
  columns: Array<{ name: string; values: (number | string | null)[]; fingerprint: ColumnFingerprint }>
): boolean {
  if (columns.length < 3) return false

  // All columns must match the checkbox pattern individually
  const allMatch = columns.every((col) =>
    isAlchemerCheckboxColumn(col.values, col.fingerprint, col.name)
  )
  if (!allMatch) return false

  // If ALL columns match the checkbox pattern, that's strong enough evidence
  // even without a shared prefix. The per-column check already validates
  // high null rate + single code value per column.
  return true
}

function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return ''
  let prefix = strings[0]
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
      if (prefix.length === 0) return ''
    }
  }
  return prefix
}

export function inferColumnType(
  values: (number | string | null)[],
  fingerprint: ColumnFingerprint,
  columnName: string
): QuestionType {
  // Check for Alchemer checkbox pattern first
  if (isAlchemerCheckboxColumn(values, fingerprint, columnName)) {
    return 'multi_response'
  }

  // Check for prefixed ordinal strings — these are always categorical
  let prefixMatchCount = 0
  let stringCount = 0
  for (let i = 0; i < Math.min(values.length, 100); i++) {
    const v = values[i]
    if (v === null) continue
    if (typeof v === 'number') continue
    const str = String(v).trim()
    if (str === '') continue
    stringCount++
    if (PREFIX_PATTERN.test(str)) prefixMatchCount++
  }
  if (stringCount >= 3 && prefixMatchCount / stringCount > 0.7) {
    return 'category'
  }

  // Mostly numeric → behavioral or rating
  if (fingerprint.numericRatio > 0.8) {
    // Many unique values → continuous behavioral metric
    if (fingerprint.nUnique > 10) {
      return 'behavioral'
    }
    // Few unique values → could be ordinal scale
    return 'rating'
  }

  // Mostly text → categorical
  return 'category'
}
