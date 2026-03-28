/**
 * resolveColumn() — the ONLY place transformations are applied.
 *
 * Pure function. Zero side effects. Deterministic.
 * Every analysis call passes column data through this resolver.
 * No analysis ever touches rawValues directly.
 *
 * Usage:
 *   const resolved = resolveColumn(columnDefinition)
 *   // or with a frozen snapshot for per-run override:
 *   const resolved = resolveColumn(columnDefinition, snapshotStack)
 */

import type { ColumnDefinition } from '../types/dataTypes'
import type { TypedTransform } from '../types/transforms'

/**
 * Apply the transform stack to a column's rawValues and return resolved values.
 *
 * @param definition  — the ColumnDefinition (rawValues + transformStack)
 * @param stackOverride — optional frozen stack snapshot for per-run analysis
 * @returns resolved values array (same length as rawValues)
 */
export function resolveColumn(
  definition: ColumnDefinition,
  stackOverride?: TypedTransform[]
): (number | string | null)[] {
  const stack = stackOverride ?? (definition.transformStack as TypedTransform[])

  // Start from rawValues — never mutate the original
  let values = definition.rawValues.slice()

  // Apply each enabled transform in order
  for (const transform of stack) {
    if (!transform.enabled) continue
    values = applyTransform(values, transform)
  }

  // Prefixed ordinal: strip "N) " prefix for display, preserve numeric sort order.
  // rawValues keep the original string. Resolved values get the display label.
  // Sort order is handled by resolvePrefixedOrdinalSortKeys() — call separately when needed.
  const catSub = definition.categorySubtype ?? definition.subtype
  if (catSub === 'prefixed_ordinal') {
    values = values.map((v) => {
      if (v === null) return null
      const str = String(v)
      const match = str.match(/^\d+\)\s*(.*)$/)
      return match ? match[1] : str
    })
  }

  return values
}

/**
 * Extract numeric sort keys from a prefixed ordinal column.
 * Returns parallel array of sort keys (numbers) for ordering.
 *
 * "0) NonPayer" → 0
 * "10) Veteran" → 10
 * "2) Minnow"  → 2
 *
 * Use this for chart axis ordering and significance test group ordering.
 * Sort by these keys, display the resolveColumn() output.
 */
export function resolvePrefixedOrdinalSortKeys(
  definition: ColumnDefinition
): (number | null)[] {
  return definition.rawValues.map((v) => {
    if (v === null) return null
    const str = String(v)
    const match = str.match(/^(\d+)\)/)
    return match ? parseInt(match[1], 10) : null
  })
}

/**
 * Apply a single transform to a values array.
 * Returns a new array — never mutates the input.
 */
function applyTransform(
  values: (number | string | null)[],
  transform: TypedTransform
): (number | string | null)[] {
  switch (transform.type) {
    case 'reverseCode':
      return applyReverseCode(values, transform.params)

    case 'labelMap':
      return applyLabelMap(values, transform.params)

    case 'recodeRange':
      return applyRecodeRange(values, transform.params)

    case 'logTransform':
      return applyLogTransform(values, transform.params)

    case 'zScore':
      return applyZScore(values, transform.params)

    case 'winsorize':
      return applyWinsorize(values, transform.params)

    case 'computeVariable':
      // ComputeVariable produces a NEW column — it needs access to other columns,
      // so it's handled at the store level, not here. Return values unchanged.
      return values

    case 'interactionTerm':
      // InteractionTerm also needs two columns — handled at store level.
      return values

    default:
      return values
  }
}

// ============================================================
// Transform implementations
// ============================================================

/** Flip scale: newVal = scaleMin + scaleMax - oldVal */
function applyReverseCode(
  values: (number | string | null)[],
  params: { scaleMin: number; scaleMax: number }
): (number | string | null)[] {
  const { scaleMin, scaleMax } = params
  const sum = scaleMin + scaleMax
  return values.map((v) => {
    if (v === null) return null
    if (typeof v === 'number') return sum - v
    const n = parseFloat(v)
    if (!isNaN(n)) return sum - n
    return v // non-numeric strings pass through
  })
}

/** Map numeric values to labels. Stats Engine receives labels for display only. */
function applyLabelMap(
  values: (number | string | null)[],
  params: { map: Record<number, string | Record<string, string>> }
): (number | string | null)[] {
  const { map } = params
  return values.map((v) => {
    if (v === null) return null
    const key = typeof v === 'number' ? v : parseFloat(v as string)
    if (isNaN(key)) return v
    const mapped = map[key]
    if (mapped === undefined) return v
    // If mapped is a locale object, use first locale (display concern, not engine)
    if (typeof mapped === 'object') {
      const keys = Object.keys(mapped)
      return keys.length > 0 ? mapped[keys[0]] : v
    }
    return mapped
  })
}

/** Collapse values using range rules */
function applyRecodeRange(
  values: (number | string | null)[],
  params: { rules: Array<{ from: number[]; to: number }> }
): (number | string | null)[] {
  const { rules } = params
  return values.map((v) => {
    if (v === null) return null
    const n = typeof v === 'number' ? v : parseFloat(v as string)
    if (isNaN(n)) return v
    for (const rule of rules) {
      if (rule.from.includes(n)) return rule.to
    }
    return v // no matching rule — pass through
  })
}

/** Log transform: log_base(value + constant) */
function applyLogTransform(
  values: (number | string | null)[],
  params: { base: number; constant: number }
): (number | string | null)[] {
  const { base, constant } = params
  const logBase = Math.log(base)
  return values.map((v) => {
    if (v === null) return null
    const n = typeof v === 'number' ? v : parseFloat(v as string)
    if (isNaN(n)) return v
    const shifted = n + constant
    if (shifted <= 0) return null // log of non-positive is undefined
    return Math.log(shifted) / logBase
  })
}

/** Standardize to z-scores: (value - mean) / sd */
function applyZScore(
  values: (number | string | null)[],
  params: { mean: number; sd: number }
): (number | string | null)[] {
  const { mean, sd } = params
  if (sd === 0) return values // avoid division by zero — return unchanged
  return values.map((v) => {
    if (v === null) return null
    const n = typeof v === 'number' ? v : parseFloat(v as string)
    if (isNaN(n)) return v
    return (n - mean) / sd
  })
}

/** Cap extreme values at pre-computed bounds */
function applyWinsorize(
  values: (number | string | null)[],
  params: { lowerPct: number; upperPct: number; lowerBound: number; upperBound: number }
): (number | string | null)[] {
  const { lowerBound, upperBound } = params
  return values.map((v) => {
    if (v === null) return null
    const n = typeof v === 'number' ? v : parseFloat(v as string)
    if (isNaN(n)) return v
    if (n < lowerBound) return lowerBound
    if (n > upperBound) return upperBound
    return n
  })
}
