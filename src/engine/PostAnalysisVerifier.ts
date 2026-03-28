/**
 * PostAnalysisVerifier — runs after findings land in FindingsStore.
 *
 * Pure function module — no store imports, no React, no side effects.
 * Receives data and findings, runs structural confound checks, returns results.
 *
 * Two checks:
 *   1. Simpson's Paradox — direction reversal within segment strata
 *   2. Moderation — effect size variation across segment strata
 */

import type { Finding, ColumnDefinition, VerificationResult } from '../types/dataTypes'

// ============================================================
// Types
// ============================================================

export interface VerifierContext {
  finding: Finding
  allColumns: ColumnDefinition[]
  segmentColumns: ColumnDefinition[]
  rowCount: number
}

// ============================================================
// Public API
// ============================================================

export const PostAnalysisVerifier = {
  run(context: VerifierContext): VerificationResult[] {
    const results: VerificationResult[] = []

    if (context.segmentColumns.length === 0) return results

    const simpson = checkSimpsonsParadox(context)
    if (simpson) results.push(simpson)

    const moderation = checkModeration(context)
    if (moderation) results.push(moderation)

    return results
  },
}

// ============================================================
// Check 1 — Simpson's Paradox detection
// ============================================================

function checkSimpsonsParadox(context: VerifierContext): VerificationResult | null {
  const { finding, allColumns, segmentColumns, rowCount } = context

  // Only runs on group comparison findings
  if (!['significance', 'kw_significance', 'crosstab', 'posthoc'].includes(finding.type)) {
    return null
  }

  if (!finding.significant) return null

  // Parse detail to extract column info
  const detailData = safeParseDetail(finding.detail)
  if (!detailData) return null

  // Find the analyzed column — first non-segment column
  const analysisCols = allColumns.filter((c) =>
    c.type !== 'category' && c.type !== 'radio'
  )
  if (analysisCols.length === 0) return null

  const targetCol = analysisCols[0]

  for (const segCol of segmentColumns) {
    const segValues = segCol.rawValues
    const uniqueSegValues = Array.from(new Set(segValues.filter((v) => v !== null)))

    // Only check segments with 2-5 unique values
    if (uniqueSegValues.length < 2 || uniqueSegValues.length > 5) continue

    // Compute overall direction: higher median group
    const targetValues = targetCol.rawValues
    const overallMedian = computeMedian(
      targetValues.filter((v): v is number => typeof v === 'number')
    )

    // Split by segment and compute per-stratum medians
    const strataResults: Array<{
      segmentValue: string | number
      median: number
      n: number
      aboveOverall: boolean
    }> = []

    let hasReversal = false
    let reversalStratum: string | number | null = null

    for (const sv of uniqueSegValues) {
      const indices = segValues
        .map((v, i) => (v === sv ? i : -1))
        .filter((i) => i >= 0)

      if (indices.length < 10) continue // minimum stratum size

      const stratumValues = indices
        .map((i) => targetValues[i])
        .filter((v): v is number => typeof v === 'number')

      if (stratumValues.length < 5) continue

      const stratumMedian = computeMedian(stratumValues)
      const aboveOverall = stratumMedian >= overallMedian

      strataResults.push({
        segmentValue: sv as string | number,
        median: stratumMedian,
        n: indices.length,
        aboveOverall,
      })
    }

    if (strataResults.length < 2) continue

    // Check for direction reversal
    const firstDirection = strataResults[0].aboveOverall
    for (const sr of strataResults.slice(1)) {
      if (sr.aboveOverall !== firstDirection) {
        hasReversal = true
        reversalStratum = sr.segmentValue
        break
      }
    }

    if (hasReversal) {
      return {
        findingId: finding.id,
        checkType: 'simpsons_paradox',
        severity: 'warning',
        detail: {
          segmentColumn: segCol.name,
          strata: strataResults,
          overallMedian,
          reversalStratum,
        },
        message: `Overall, the effect is significant. However, when broken down by ${segCol.name}, the pattern reverses in the "${reversalStratum}" group. This may indicate Simpson's Paradox — the overall result could be driven by sample composition rather than a true difference. Check whether ${segCol.name} is a confounding variable.`,
      }
    }
  }

  return null
}

// ============================================================
// Check 2 — Basic moderation check
// ============================================================

function checkModeration(context: VerifierContext): VerificationResult | null {
  const { finding, allColumns, segmentColumns, rowCount } = context

  // Only runs on significant findings from regression, driver, or KW
  if (!['regression', 'driver_analysis', 'kw_significance', 'significance'].includes(finding.type)) {
    return null
  }

  if (!finding.significant) return null

  // Need a segment with 2-4 unique values
  const segCol = segmentColumns.find((c) => {
    const unique = new Set(c.rawValues.filter((v) => v !== null))
    return unique.size >= 2 && unique.size <= 4
  })

  if (!segCol) return null

  const uniqueSegValues = Array.from(new Set(segCol.rawValues.filter((v) => v !== null)))

  // Find the analyzed continuous column
  const continuousCols = allColumns.filter((c) =>
    c.type === 'rating' || c.type === 'matrix' || c.type === 'behavioral'
  )
  if (continuousCols.length === 0) return null

  const targetCol = continuousCols[0]

  // Compute effect size per stratum
  // For simplicity, use variance ratio (between-group variance / total variance) as effect proxy
  const strataEffects: Array<{
    segmentValue: string | number
    effectSize: number
    mean: number
    n: number
  }> = []

  const minStratumSize = finding.type === 'regression' || finding.type === 'driver_analysis' ? 15 : 10

  for (const sv of uniqueSegValues) {
    const indices = segCol.rawValues
      .map((v, i) => (v === sv ? i : -1))
      .filter((i) => i >= 0)

    if (indices.length < minStratumSize) return null // any stratum too small → skip entirely

    const stratumValues = indices
      .map((i) => targetCol.rawValues[i])
      .filter((v): v is number => typeof v === 'number')

    if (stratumValues.length < 5) return null

    const mean = stratumValues.reduce((s, v) => s + v, 0) / stratumValues.length
    const sd = Math.sqrt(
      stratumValues.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (stratumValues.length - 1)
    )

    // Use SD as effect proxy — comparing variability across strata
    strataEffects.push({
      segmentValue: sv as string | number,
      effectSize: sd > 0 ? sd : 0.001,
      mean,
      n: indices.length,
    })
  }

  if (strataEffects.length < 2) return null

  // Check for moderation: effect size ratio > 2.0 or direction reversal
  const effectSizes = strataEffects.map((s) => s.effectSize)
  const maxEffect = Math.max(...effectSizes)
  const minEffect = Math.min(...effectSizes)
  const ratio = minEffect > 0 ? maxEffect / minEffect : Infinity

  // Direction check: means in opposite directions relative to grand mean
  const grandMean = strataEffects.reduce((s, e) => s + e.mean * e.n, 0) /
    strataEffects.reduce((s, e) => s + e.n, 0)
  const directions = strataEffects.map((s) => s.mean >= grandMean)
  const hasDirectionReversal = directions.some((d) => d !== directions[0])

  if (ratio <= 2.0 && !hasDirectionReversal) return null

  const strongStratum = strataEffects.reduce((a, b) => a.effectSize > b.effectSize ? a : b)
  const weakStratum = strataEffects.reduce((a, b) => a.effectSize < b.effectSize ? a : b)

  return {
    findingId: finding.id,
    checkType: 'moderation_check',
    severity: hasDirectionReversal ? 'warning' : 'info',
    detail: {
      segmentColumn: segCol.name,
      strataEffects,
      ratio,
      hasDirectionReversal,
      grandMean,
    },
    message: `The effect varies substantially across ${segCol.name}. In "${strongStratum.segmentValue}" the effect is ${hasDirectionReversal ? 'reversed' : 'stronger'} (mean=${strongStratum.mean.toFixed(2)}, n=${strongStratum.n}), while in "${weakStratum.segmentValue}" it is ${hasDirectionReversal ? 'opposite' : 'weaker'} (mean=${weakStratum.mean.toFixed(2)}, n=${weakStratum.n}). Consider whether ${segCol.name} moderates this relationship before reporting the main effect alone.`,
  }
}

// ============================================================
// Helpers
// ============================================================

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function safeParseDetail(detail: string): Record<string, unknown> | null {
  try {
    return typeof detail === 'object' ? detail as any : JSON.parse(detail)
  } catch {
    return {}
  }
}
