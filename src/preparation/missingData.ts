/**
 * Missing data diagnostics.
 *
 * Surfaces useful information about missing patterns.
 * Does not apply strategies — null handling is determined
 * by nullMeaning on each column, not by a global strategy.
 */

import type { ColumnDefinition } from '../types/dataTypes'
import type { MissingDataSummary, LittlesMCARResult } from './types'
import * as StatsEngine from '../engine/stats-engine'

export interface MICEResult {
  imputedColumns: Map<string, (number | string | null)[]>
  totalImputed: number
  columnsImputed: number
  method: 'mice'
  nImputations: number
}

/**
 * Compute missing data diagnostics for a set of columns.
 */
export function computeMissingDiagnostics(columns: ColumnDefinition[]): MissingDataSummary {
  let totalMissing = 0
  let totalCells = 0

  const perColumn = columns.map((col) => {
    const nMissing = col.rawValues.filter((v) => v === null || v === undefined).length
    totalMissing += nMissing
    totalCells += col.rawValues.length

    return {
      columnId: col.id,
      columnName: col.name,
      nMissing,
      pctMissing: col.rawValues.length > 0 ? (nMissing / col.rawValues.length) * 100 : 0,
    }
  })

  const variablesAbove20pct = perColumn
    .filter((c) => c.pctMissing > 20)
    .map((c) => c.columnId)

  return {
    totalMissing,
    totalCells,
    pctMissing: totalCells > 0 ? (totalMissing / totalCells) * 100 : 0,
    perColumn,
    variablesAbove20pct,
  }
}

/**
 * Little's MCAR test — is missingness random or systematic?
 *
 * Simplified implementation: tests whether the pattern of missing values
 * is independent of observed values using a chi-square approach.
 * If p < 0.05, missingness is NOT completely at random.
 */
export function littlesMCARTest(columns: ColumnDefinition[]): LittlesMCARResult {
  const n = columns[0]?.rawValues.length ?? 0
  const k = columns.length

  if (n < 10 || k < 2) {
    return { chiSq: 0, df: 0, p: 1, interpretation: 'insufficient_data' }
  }

  // Build missingness indicator matrix
  const missingPatterns = new Map<string, number>()
  const patternRows = new Map<string, number[]>()

  for (let i = 0; i < n; i++) {
    const pattern = columns.map((col) => col.rawValues[i] === null ? '1' : '0').join('')
    missingPatterns.set(pattern, (missingPatterns.get(pattern) ?? 0) + 1)
    if (!patternRows.has(pattern)) patternRows.set(pattern, [])
    patternRows.get(pattern)!.push(i)
  }

  // If only one pattern (all complete or all missing same way), can't test
  if (missingPatterns.size <= 1) {
    return { chiSq: 0, df: 0, p: 1, interpretation: 'MCAR' }
  }

  // Extract numeric values for computation
  const numericCols: number[][] = columns.map((col) =>
    col.rawValues.map((v) => {
      if (v === null) return NaN
      if (typeof v === 'number') return v
      const num = parseFloat(String(v))
      return isNaN(num) ? NaN : num
    })
  )

  // Grand means (from observed values only)
  const grandMeans = numericCols.map((col) => {
    const valid = col.filter((v) => !isNaN(v))
    return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : 0
  })

  // Grand variances
  const grandVars = numericCols.map((col, j) => {
    const valid = col.filter((v) => !isNaN(v))
    if (valid.length < 2) return 1
    const m = grandMeans[j]
    return valid.reduce((s, v) => s + (v - m) * (v - m), 0) / (valid.length - 1)
  })

  // Chi-square: sum over patterns of n_p * sum_j((mean_pj - mean_j)^2 / var_j)
  let chiSq = 0
  let dfCount = 0

  for (const [pattern, rows] of patternRows) {
    const nP = rows.length
    if (nP < 2) continue

    for (let j = 0; j < k; j++) {
      // Only for columns observed in this pattern
      if (pattern[j] === '1') continue // column is missing in this pattern

      const patternVals = rows
        .map((i) => numericCols[j][i])
        .filter((v) => !isNaN(v))

      if (patternVals.length < 2 || grandVars[j] === 0) continue

      const patternMean = patternVals.reduce((s, v) => s + v, 0) / patternVals.length
      chiSq += nP * Math.pow(patternMean - grandMeans[j], 2) / grandVars[j]
      dfCount++
    }
  }

  // df = total observed cells across patterns minus k (for grand means)
  const df = Math.max(1, dfCount - k)

  // p-value from chi-square distribution (simplified — use normal approx for large df)
  let p: number
  if (df <= 0) {
    p = 1
  } else {
    // Wilson-Hilferty approximation for chi-square CDF
    const z = Math.pow(chiSq / df, 1 / 3) - (1 - 2 / (9 * df))
    const denom = Math.sqrt(2 / (9 * df))
    const zScore = denom > 0 ? z / denom : 0
    // Standard normal CDF approximation
    p = 1 - normalCDF(zScore)
  }

  p = Math.max(0, Math.min(1, p))

  return {
    chiSq,
    df,
    p,
    interpretation: p < 0.05 ? 'not_MCAR' : 'MCAR',
  }
}

/**
 * Run MICE (Multiple Imputation by Chained Equations) on columns with
 * nullMeaning === 'missing' that are numeric.
 *
 * Returns imputed values per column. rawValues are not modified.
 */
export function runMICEImputation(
  columns: ColumnDefinition[],
  rowCount: number
): MICEResult {
  // Filter to eligible columns: numeric, nullMeaning === 'missing', has missing values
  const eligible = columns.filter((c) =>
    (c.nullMeaning === 'missing' || c.nullMeaning === undefined)
    && (c.type === 'rating' || c.type === 'behavioral' || c.type === 'matrix')
    && c.nMissing > 0
  )

  if (eligible.length === 0) {
    return { imputedColumns: new Map(), totalImputed: 0, columnsImputed: 0, method: 'mice', nImputations: 5 }
  }

  // Also include numeric columns with NO missing as predictors
  const allNumeric = columns.filter((c) =>
    (c.type === 'rating' || c.type === 'behavioral' || c.type === 'matrix')
    && (c.nullMeaning === 'missing' || c.nullMeaning === undefined)
  )

  // Build column-major data matrix for the engine
  // data[j][i] = column j, row i
  const n = rowCount
  const data: (number | null)[][] = allNumeric.map((col) => {
    const result: (number | null)[] = []
    for (let i = 0; i < n; i++) {
      const v = col.rawValues[i]
      if (v === null || v === undefined) {
        result.push(null)
      } else {
        const num = typeof v === 'number' ? v : parseFloat(String(v))
        result.push(isNaN(num) ? null : num)
      }
    }
    return result
  })

  // @ts-ignore — engine is @ts-nocheck
  const miceResult = StatsEngine.multipleImputation(data, 5)

  // Map pooled results back to column IDs
  const imputedColumns = new Map<string, (number | string | null)[]>()
  let totalImputed = 0

  for (let j = 0; j < allNumeric.length; j++) {
    const col = allNumeric[j]
    if (col.nMissing === 0) continue // no missing values — skip

    const pooledCol = miceResult.pooledData[j]
    const imputedArr: (number | string | null)[] = []

    for (let i = 0; i < n; i++) {
      if (col.rawValues[i] === null || col.rawValues[i] === undefined) {
        imputedArr.push(pooledCol[i])
        totalImputed++
      } else {
        imputedArr.push(col.rawValues[i])
      }
    }

    imputedColumns.set(col.id, imputedArr)
  }

  return {
    imputedColumns,
    totalImputed,
    columnsImputed: imputedColumns.size,
    method: 'mice',
    nImputations: 5,
  }
}

/**
 * Replace null values with the mean of non-null values.
 * Returns a new array — never mutates input.
 * Available for future use (MICE wiring, SQL data imports).
 */
export function imputeColumnMean(values: (number | null)[]): (number | null)[] {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length === 0) return values.slice()
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length
  return values.map((v) => (v === null ? mean : v))
}

/**
 * Replace null values with the median of non-null values.
 * Returns a new array — never mutates input.
 * Used for automatic low-rate imputation (≤5% missing) on behavioral columns.
 */
export function imputeColumnMedian(values: (number | null)[]): (number | null)[] {
  const nums = values.filter((v): v is number => v !== null).sort((a, b) => a - b)
  if (nums.length === 0) return values.slice()
  const mid = Math.floor(nums.length / 2)
  const median = nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid]
  return values.map((v) => (v === null ? median : v))
}

// Standard normal CDF approximation (Abramowitz & Stegun)
function normalCDF(z: number): number {
  if (z < -8) return 0
  if (z > 8) return 1
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.sqrt(2)
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}
