/**
 * Subtype auto-detection — refines behavioral and category columns
 * after fingerprint is computed.
 *
 * Called once per column at parse time. Result stored in
 * ColumnDefinition.behavioralSubtype / categorySubtype.
 */

import type { ColumnFingerprint, BehavioralSubtype, CategorySubtype } from '../types/dataTypes'

// ============================================================
// Behavioral subtype detection
// ============================================================

export function detectBehavioralSubtype(
  values: (number | string | null)[],
  fingerprint: ColumnFingerprint
): BehavioralSubtype {
  const nums: number[] = []
  for (const v of values) {
    if (v === null) continue
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(n) && isFinite(n)) nums.push(n)
  }

  if (nums.length === 0) return 'metric'

  const min = fingerprint.min ?? Math.min(...nums)
  const max = fingerprint.max ?? Math.max(...nums)
  const allIntegers = nums.every((n) => Number.isInteger(n))
  const nUnique = fingerprint.nUnique

  // proportion: range [0,1], not all integers
  if (min >= 0 && max <= 1 && !allIntegers) {
    return 'proportion'
  }

  // ordinal_rank: all integers, min>=0, max<=20, nUnique<=20
  if (allIntegers && min >= 0 && max <= 20 && nUnique <= 20) {
    return 'ordinal_rank'
  }

  // spend: zero-inflated + right-skewed
  const zeroCount = nums.filter((n) => n === 0).length
  const zeroPct = zeroCount / nums.length
  if (zeroPct > 0.4 && nums.length >= 10) {
    // Compute skewness
    const mean = nums.reduce((s, v) => s + v, 0) / nums.length
    const sd = Math.sqrt(nums.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (nums.length - 1))
    if (sd > 0 && nums.length >= 3) {
      const skew = (nums.length / ((nums.length - 1) * (nums.length - 2))) *
        nums.reduce((s, v) => s + Math.pow((v - mean) / sd, 3), 0)
      if (skew > 2) return 'spend'
    }
    // Even without high skew, >40% zeros + positive tail = spend
    if (max > 0) return 'spend'
  }

  // count: all non-negative integers
  if (allIntegers && min >= 0) {
    return 'count'
  }

  return 'metric'
}

// ============================================================
// Category subtype detection
// ============================================================

const GEO_NAME_PATTERNS = /country|region|city|state|province|geo|location|market/i

export function detectCategorySubtype(
  values: (number | string | null)[],
  fingerprint: ColumnFingerprint,
  columnName: string
): CategorySubtype {
  // constant: nUnique = 1
  if (fingerprint.nUnique <= 1) {
    return 'constant'
  }

  // prefixed_ordinal: >70% values match digit prefix patterns
  // Matches: "2) Minnow", "3) Dolphin", "4_marquis", "6_king", "0) NonPayer"
  const PREFIX_PATTERN = /^\d+[)_]\s*/
  let matchCount = 0
  let checkedCount = 0
  for (let i = 0; i < Math.min(values.length, 100); i++) {
    const v = values[i]
    if (v === null || typeof v === 'number') continue
    const str = String(v).trim()
    if (str === '') continue
    checkedCount++
    if (PREFIX_PATTERN.test(str)) matchCount++
  }
  if (checkedCount >= 3 && matchCount / checkedCount > 0.7) {
    return 'prefixed_ordinal'
  }

  // geo: column name matches geo patterns OR nUnique 2-200 all strings
  if (GEO_NAME_PATTERNS.test(columnName)) {
    return 'geo'
  }

  return 'nominal'
}
