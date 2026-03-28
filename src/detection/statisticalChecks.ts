/**
 * Statistical detection checks — deterministic, no API calls, < 100ms per column.
 *
 * Six checks run synchronously on column data:
 *   1. checkReverseCoded     — negative correlation with scale peers
 *   2. checkMergedHeaders    — question text in data rows (non-numeric first row)
 *   3. checkPossibleComputed — linear combination of other columns (R² > 0.95)
 *   4. checkTimestampColumn  — date/time pattern detection
 *   5. checkMultiAssignedCodes — pipe/comma-separated codes in cells
 *   6. checkCollapsedCategories — fewer unique values than expected scale range
 */

import type { DetectionFlag, CheckInput } from './types'

// ============================================================
// 1. Reverse-coded item detection
// ============================================================

/**
 * Flags a column as potentially reverse-coded if it has negative correlation
 * with the majority of peer columns in the same scale group.
 *
 * Prevention case R1/R2: without this, Cronbach α and factor analysis
 * produce garbage on mixed-direction scales.
 */
export function checkReverseCoded(input: CheckInput): DetectionFlag | null {
  const { columnId, values, peerColumns } = input
  if (!peerColumns || peerColumns.length < 2) return null

  const nums = extractNumeric(values)
  if (nums.length < 5) return null

  let negCount = 0
  let totalChecked = 0

  for (const peer of peerColumns) {
    const peerNums = extractNumeric(peer.values)
    if (peerNums.length < 5) continue

    const r = pearsonR(nums.values, peerNums.values, nums.indices, peerNums.indices)
    if (r === null) continue

    totalChecked++
    if (r < -0.1) negCount++
  }

  if (totalChecked < 2) return null

  const negRatio = negCount / totalChecked
  if (negRatio < 0.5) return null

  const confidence = Math.min(negRatio, 0.95)

  return {
    id: `rev_${columnId}_${Date.now()}`,
    type: 'reverse_coded',
    columnId,
    severity: 'warning',
    source: 'statistical',
    confidence,
    message: `This item is negatively correlated with ${negCount} of ${totalChecked} peer items — likely reverse-worded.`,
    suggestion: 'Apply reverseCode transform before reliability or factor analysis.',
    detail: { negativeCount: negCount, totalPeers: totalChecked, negRatio },
    timestamp: Date.now(),
  }
}

// ============================================================
// 2. Merged header detection
// ============================================================

/**
 * Detects when the first data row looks like a second header row
 * (Qualtrics/SurveyMonkey double-header exports).
 *
 * Prevention case R3: without this, row 2 is treated as data and
 * the column gets classified as categorical with one unique value.
 */
export function checkMergedHeaders(input: CheckInput): DetectionFlag | null {
  const { columnId, values } = input
  if (values.length < 3) return null

  const firstVal = values[0]
  if (firstVal === null) return null
  if (typeof firstVal === 'number') return null

  // First value is a string — check if it looks like question text
  const str = String(firstVal).trim()
  if (str.length < 10) return null // too short to be question text

  // Heuristic: question text is long, contains spaces, and subsequent rows are numeric
  const hasSpaces = str.includes(' ')
  if (!hasSpaces) return null

  // Check if the rest of the column is mostly numeric
  let numericCount = 0
  for (let i = 1; i < Math.min(values.length, 20); i++) {
    const v = values[i]
    if (v === null) continue
    if (typeof v === 'number') { numericCount++; continue }
    const n = parseFloat(String(v))
    if (!isNaN(n)) numericCount++
  }

  const restCount = Math.min(values.length - 1, 19)
  if (restCount === 0) return null
  const numericRatio = numericCount / restCount

  if (numericRatio < 0.6) return null

  return {
    id: `hdr_${columnId}_${Date.now()}`,
    type: 'merged_header',
    columnId,
    severity: 'critical',
    source: 'statistical',
    confidence: Math.min(0.7 + numericRatio * 0.3, 0.95),
    message: `First data value looks like a header row: "${str.slice(0, 60)}..."`,
    suggestion: 'Re-paste with the extra header row removed, or mark row 1 as a second header.',
    detail: { firstValue: str, numericRatioAfter: numericRatio },
    timestamp: Date.now(),
  }
}

// ============================================================
// 3. Possible computed column detection
// ============================================================

/**
 * Detects columns that are near-perfect linear combinations of other columns.
 *
 * Prevention case R4: SAT_mean = MEAN(Q1,Q2,Q3,Q4) included as predictor
 * alongside Q1–Q4 produces VIF > 50 and meaningless betas.
 */
export function checkPossibleComputed(input: CheckInput): DetectionFlag | null {
  const { columnId, values, allColumns } = input
  if (!allColumns || allColumns.length < 2) return null

  const target = extractNumeric(values)
  if (target.length < 10) return null

  // Check if this column is a mean/sum of any subset of other columns
  // Quick check: correlate with mean of all other numeric columns
  const otherNumeric = allColumns
    .filter((c) => c.columnId !== columnId)
    .map((c) => ({ id: c.columnId, ...extractNumeric(c.values) }))
    .filter((c) => c.length >= 10)

  if (otherNumeric.length < 2) return null

  // Compute mean of other columns at each row, then correlate
  const n = target.values.length
  const meanOther: number[] = []
  const sumOther: number[] = []

  for (let i = 0; i < n; i++) {
    const idx = target.indices[i]
    let s = 0
    let count = 0
    for (const col of otherNumeric) {
      // Find this row index in the other column
      const pos = col.indices.indexOf(idx)
      if (pos !== -1) {
        s += col.values[pos]
        count++
      }
    }
    if (count > 0) {
      meanOther.push(s / count)
      sumOther.push(s)
    } else {
      meanOther.push(NaN)
      sumOther.push(NaN)
    }
  }

  // Check correlation with mean and sum
  const validMean = meanOther.filter((v) => !isNaN(v))
  const validSum = sumOther.filter((v) => !isNaN(v))

  if (validMean.length < 10) return null

  // Filter to aligned pairs
  const alignedTarget: number[] = []
  const alignedMean: number[] = []
  const alignedSum: number[] = []
  for (let i = 0; i < n; i++) {
    if (!isNaN(meanOther[i])) {
      alignedTarget.push(target.values[i])
      alignedMean.push(meanOther[i])
      alignedSum.push(sumOther[i])
    }
  }

  const rMean = rawPearson(alignedTarget, alignedMean)
  const rSum = rawPearson(alignedTarget, alignedSum)

  const bestR = Math.max(
    rMean !== null ? Math.abs(rMean) : 0,
    rSum !== null ? Math.abs(rSum) : 0
  )

  if (bestR < 0.95) return null

  const rSquared = bestR * bestR
  const isSum = rSum !== null && Math.abs(rSum) > (rMean !== null ? Math.abs(rMean) : 0)

  return {
    id: `comp_${columnId}_${Date.now()}`,
    type: 'possible_computed',
    columnId,
    severity: 'critical',
    source: 'statistical',
    confidence: Math.min(rSquared, 0.99),
    message: `This column is nearly a perfect ${isSum ? 'sum' : 'mean'} of other columns (R² = ${rSquared.toFixed(3)}). Including it as a predictor alongside its components will cause extreme multicollinearity.`,
    suggestion: 'Exclude this column from regression/driver analysis, or remove the component columns.',
    detail: { rSquared, correlationType: isSum ? 'sum' : 'mean', nOtherColumns: otherNumeric.length },
    timestamp: Date.now(),
  }
}

// ============================================================
// 4. Timestamp column detection
// ============================================================

const TIMESTAMP_PATTERNS = [
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,                        // 2024-03-15
  /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/,                      // 03/15/2024 or 3-15-24
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}[T ]\d{1,2}:\d{2}/,       // 2024-03-15T10:30 or with space
  /^\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?$/i,                 // 10:30, 10:30:00, 10:30 AM
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,   // Jan 15, 2024
]

/**
 * Detects columns containing date/time values.
 *
 * Prevention case R6: timestamp columns get misclassified as categorical
 * or treated as meaningless ordinal numbers (20240315).
 */
export function checkTimestampColumn(input: CheckInput): DetectionFlag | null {
  const { columnId, values } = input
  if (values.length < 3) return null

  let matchCount = 0
  let checkedCount = 0

  for (let i = 0; i < Math.min(values.length, 50); i++) {
    const v = values[i]
    if (v === null) continue
    const str = String(v).trim()
    if (str === '') continue
    checkedCount++

    for (const pattern of TIMESTAMP_PATTERNS) {
      if (pattern.test(str)) {
        matchCount++
        break
      }
    }
  }

  if (checkedCount < 3) return null
  const matchRatio = matchCount / checkedCount
  if (matchRatio < 0.7) return null

  return {
    id: `ts_${columnId}_${Date.now()}`,
    type: 'timestamp_column',
    columnId,
    severity: 'info',
    source: 'statistical',
    confidence: Math.min(matchRatio, 0.95),
    message: `${Math.round(matchRatio * 100)}% of values match date/time patterns. This column may be a timestamp.`,
    suggestion: 'Reclassify as "timestamped" type for temporal analysis, or convert to a numeric duration.',
    detail: { matchRatio, matchCount, checkedCount },
    timestamp: Date.now(),
  }
}

// ============================================================
// 5. Multi-assigned codes detection
// ============================================================

/**
 * Detects columns where cells contain pipe- or comma-separated codes
 * (e.g., "1,3" or "theme_a|theme_b").
 *
 * Prevention case R7: without this, "1,3" is treated as a single category
 * producing 24 spurious categories from 4 codes.
 */
export function checkMultiAssignedCodes(input: CheckInput): DetectionFlag | null {
  const { columnId, values } = input
  if (values.length < 3) return null

  let multiCount = 0
  let checkedCount = 0
  let separator: string | null = null

  for (let i = 0; i < Math.min(values.length, 100); i++) {
    const v = values[i]
    if (v === null) continue
    const str = String(v).trim()
    if (str === '') continue
    checkedCount++

    // Check for common multi-assign separators
    if (str.includes('|')) {
      const parts = str.split('|').map((s) => s.trim()).filter((s) => s.length > 0)
      if (parts.length >= 2) {
        multiCount++
        separator = separator ?? '|'
      }
    } else if (/^\d+(,\d+)+$/.test(str)) {
      // Numeric codes separated by commas: "1,3,5"
      multiCount++
      separator = separator ?? ','
    } else if (/^[a-zA-Z_]+(,[a-zA-Z_]+)+$/.test(str.replace(/\s/g, ''))) {
      // Text codes separated by commas: "theme_a,theme_b"
      multiCount++
      separator = separator ?? ','
    }
  }

  if (checkedCount < 3) return null
  const multiRatio = multiCount / checkedCount
  if (multiRatio < 0.2) return null

  return {
    id: `multi_${columnId}_${Date.now()}`,
    type: 'multi_assigned_codes',
    columnId,
    severity: 'warning',
    source: 'statistical',
    confidence: Math.min(multiRatio * 1.2, 0.95),
    message: `${Math.round(multiRatio * 100)}% of values contain multiple codes separated by "${separator}". This is a multi-assigned variable, not a single category.`,
    suggestion: 'Reclassify as "multi_assigned" type. The parser will explode this into a binary indicator matrix for analysis.',
    detail: { multiRatio, separator, multiCount, checkedCount },
    timestamp: Date.now(),
  }
}

// ============================================================
// 6. Collapsed categories detection
// ============================================================

/**
 * Detects when a column has fewer unique values than its declared scale range
 * would suggest — indicating that categories were collapsed externally.
 */
export function checkCollapsedCategories(input: CheckInput): DetectionFlag | null {
  const { columnId, values, declaredScaleRange } = input
  if (!declaredScaleRange) return null

  const [scaleMin, scaleMax] = declaredScaleRange
  const expectedPoints = scaleMax - scaleMin + 1
  if (expectedPoints < 3) return null

  // Count unique numeric values
  const uniqueNums = new Set<number>()
  for (const v of values) {
    if (v === null) continue
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(n)) uniqueNums.add(n)
  }

  if (uniqueNums.size === 0) return null

  // Check if any values fall outside the declared range — always check, even if unique count >= expected
  let outOfRange = 0
  for (const n of uniqueNums) {
    if (n < scaleMin || n > scaleMax) outOfRange++
  }

  // Out-of-range values are critical regardless of unique count
  if (outOfRange > 0) {
    return {
      id: `coll_${columnId}_${Date.now()}`,
      type: 'collapsed_categories',
      columnId,
      severity: 'critical',
      source: 'statistical',
      confidence: 1.0,
      message: `${outOfRange} value(s) fall outside the declared scale range (${scaleMin}–${scaleMax}). These will corrupt means and significance tests. Verify scale range or clean data before analysis.`,
      suggestion: 'Fix the declared scale range, or remove/recode out-of-range values before analysis.',
      detail: {
        expectedPoints,
        actualUnique: uniqueNums.size,
        outOfRange,
        uniqueValues: Array.from(uniqueNums).sort((a, b) => a - b),
      },
      timestamp: Date.now(),
    }
  }

  // No out-of-range — check for collapsed categories (fewer unique than expected)
  if (uniqueNums.size >= expectedPoints) return null

  const ratio = uniqueNums.size / expectedPoints

  return {
    id: `coll_${columnId}_${Date.now()}`,
    type: 'collapsed_categories',
    columnId,
    severity: 'info',
    source: 'statistical',
    confidence: 1 - ratio,
    message: `Only ${uniqueNums.size} of ${expectedPoints} expected scale points are present (${scaleMin}–${scaleMax} declared). Categories may have been collapsed externally.`,
    suggestion: 'Verify that the scale range declaration is correct, or note that some scale points have zero respondents.',
    detail: {
      expectedPoints,
      actualUnique: uniqueNums.size,
      outOfRange,
      uniqueValues: Array.from(uniqueNums).sort((a, b) => a - b),
    },
    timestamp: Date.now(),
  }
}

// ============================================================
// 7. Skewed distribution detection
// ============================================================

/**
 * Flags continuous columns with heavy right skew (skewness > 2.0).
 * Revenue, IAP, and count data are almost always right-skewed.
 * Log transform is recommended before regression or correlation.
 */
export function checkSkewedDistribution(input: CheckInput): DetectionFlag | null {
  const { columnId, values, sensitivity } = input
  if (sensitivity && sensitivity !== 'anonymous') return null
  if (values.length < 10) return null

  // Extract numeric values and compute skewness
  const nums: number[] = []
  for (const v of values) {
    if (v === null) continue
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(n) && isFinite(n)) nums.push(n)
  }

  if (nums.length < 10) return null

  // Check numeric ratio — only flag continuous data
  const numericRatio = input.fingerprint?.numericRatio ?? (nums.length / values.filter((v) => v !== null).length)
  if (numericRatio < 0.8) return null

  // Compute skewness
  const n = nums.length
  const mean = nums.reduce((s, v) => s + v, 0) / n
  const sd = Math.sqrt(nums.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1))
  if (sd === 0 || n < 3) return null

  const skewness = (n / ((n - 1) * (n - 2))) * nums.reduce((s, v) => s + Math.pow((v - mean) / sd, 3), 0)

  if (skewness <= 2.0) return null

  return {
    id: `skew_${columnId}_${Date.now()}`,
    type: 'skewed_distribution',
    columnId,
    severity: 'warning',
    source: 'statistical',
    confidence: Math.min(skewness / 5, 0.95),
    message: `This column is heavily right-skewed (skewness = ${skewness.toFixed(2)}). Log transform recommended before regression or correlation — raw values will violate linearity assumptions.`,
    suggestion: 'Apply logTransform (natural log, add constant 1 for zeros).',
    detail: {
      skewness,
      mean,
      sd,
      min: Math.min(...nums),
      max: Math.max(...nums),
      actionType: 'add_transform',
      params: { type: 'logTransform', base: Math.E, handleZero: 'add_constant', constant: 1 },
    },
    timestamp: Date.now(),
  }
}

// ============================================================
// 8. Zero-inflated distribution detection
// ============================================================

/**
 * Flags continuous columns where > 40% of values are zero
 * with a substantial positive tail. Common in IAP revenue,
 * purchase counts, and behavioral engagement metrics.
 */
export function checkZeroInflated(input: CheckInput): DetectionFlag | null {
  const { columnId, values, sensitivity } = input
  if (sensitivity && sensitivity !== 'anonymous') return null
  if (values.length < 10) return null

  const nums: number[] = []
  for (const v of values) {
    if (v === null) continue
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(n) && isFinite(n)) nums.push(n)
  }

  if (nums.length < 10) return null

  const numericRatio = input.fingerprint?.numericRatio ?? (nums.length / values.filter((v) => v !== null).length)
  if (numericRatio < 0.8) return null

  const zeroCount = nums.filter((n) => n === 0).length
  const zeroPct = zeroCount / nums.length
  const maxVal = Math.max(...nums)

  // Trigger: > 40% zeros AND max value substantially above 0
  if (zeroPct <= 0.4) return null
  if (maxVal <= 0) return null

  // "Substantially above" — max should be at least 10x the mean of non-zero values
  const nonZero = nums.filter((n) => n > 0)
  if (nonZero.length === 0) return null

  return {
    id: `zeroinf_${columnId}_${Date.now()}`,
    type: 'zero_inflated',
    columnId,
    severity: 'warning',
    source: 'statistical',
    confidence: Math.min(zeroPct * 1.3, 0.95),
    message: `${(zeroPct * 100).toFixed(0)}% of values are zero with a long tail of positive values (max = ${maxVal.toFixed(2)}). Log(value + 1) transform recommended before regression.`,
    suggestion: 'Apply logTransform (natural log, add constant 1 for zeros).',
    detail: {
      zeroPct,
      zeroCount,
      maxVal,
      nonZeroMean: nonZero.reduce((s, v) => s + v, 0) / nonZero.length,
      actionType: 'add_transform',
      params: { type: 'logTransform', base: Math.E, handleZero: 'add_constant', constant: 1 },
    },
    timestamp: Date.now(),
  }
}

// ============================================================
// 9. Prefixed ordinal detection
// ============================================================

/**
 * Detects categorical columns where values are prefixed with ordering
 * numbers, e.g. "0) NonPayer", "3) Dolphin", "1) ExPayer".
 *
 * When confirmed: strip prefix for display, use numeric prefix as sort key.
 */
export function checkPrefixedOrdinal(input: CheckInput): DetectionFlag | null {
  const { columnId, values } = input
  if (values.length < 3) return null

  const PREFIX_PATTERN = /^\d+\)\s/

  let matchCount = 0
  let checkedCount = 0
  const examples: string[] = []

  for (let i = 0; i < Math.min(values.length, 100); i++) {
    const v = values[i]
    if (v === null) continue
    if (typeof v === 'number') continue // skip numeric values
    const str = String(v).trim()
    if (str === '') continue
    checkedCount++

    if (PREFIX_PATTERN.test(str)) {
      matchCount++
      if (examples.length < 3) examples.push(str)
    }
  }

  if (checkedCount < 3) return null
  const matchRatio = matchCount / checkedCount
  if (matchRatio < 0.7) return null

  return {
    id: `preford_${columnId}_${Date.now()}`,
    type: 'prefixed_ordinal_detected',
    columnId,
    severity: 'info',
    source: 'statistical',
    confidence: Math.min(matchRatio, 0.95),
    message: `Values appear to be prefixed with ordering numbers (e.g. ${examples.map((e) => `'${e}'`).join(', ')}). Extracting numeric prefix for correct sort order in charts and significance tests.`,
    suggestion: 'Reclassify as prefixed_ordinal. Numeric prefix used as sort key, display label stripped.',
    detail: {
      matchRatio,
      examples,
      actionType: 'reclassify_column',
      params: { subtype: 'prefixed_ordinal' },
    },
    timestamp: Date.now(),
  }
}

// ============================================================
// 10. Constant column detection
// ============================================================

/**
 * Detects columns with only one unique non-null value.
 * These should be excluded from all analysis — they carry no variance.
 */
export function checkConstantColumn(input: CheckInput): DetectionFlag | null {
  const { columnId, values } = input
  if (values.length < 3) return null

  const unique = new Set<string | number>()
  for (const v of values) {
    if (v === null) continue
    unique.add(typeof v === 'number' ? v : String(v).trim())
    if (unique.size > 1) return null // early exit — not constant
  }

  if (unique.size !== 1) return null

  const soleValue = Array.from(unique)[0]

  return {
    id: `const_${columnId}_${Date.now()}`,
    type: 'constant_column',
    columnId,
    severity: 'warning',
    source: 'statistical',
    confidence: 1.0,
    message: `Only one unique value ("${soleValue}") — excluded from analysis. A constant variable has no variance and cannot contribute to any statistical test.`,
    suggestion: 'Exclude this column from analysis.',
    detail: {
      soleValue,
      actionType: 'exclude_column',
    },
    timestamp: Date.now(),
  }
}

// ============================================================
// Runner — execute all 10 checks on a column
// ============================================================

/**
 * Run all statistical checks on a single column.
 * Returns an array of detection flags (may be empty).
 * Guaranteed < 100ms per column for n < 10,000.
 */
export function runStatisticalChecks(input: CheckInput): DetectionFlag[] {
  const flags: DetectionFlag[] = []

  const checks = [
    checkReverseCoded,
    checkMergedHeaders,
    checkPossibleComputed,
    checkTimestampColumn,
    checkMultiAssignedCodes,
    checkCollapsedCategories,
    checkSkewedDistribution,
    checkZeroInflated,
    checkPrefixedOrdinal,
    checkConstantColumn,
    checkNearZeroVariance,
  ]

  for (const check of checks) {
    const flag = check(input)
    if (flag) flags.push(flag)
  }

  return flags
}

// ============================================================
// 11. Near-zero variance detection
// ============================================================

/**
 * Detects columns where the coefficient of variation is < 0.05
 * (or SD < 0.1 when mean is near zero). These columns produce
 * degenerate results in correlation and regression.
 *
 * Does NOT fire if the column is already caught by checkConstantColumn
 * (nUnique === 1) to avoid double-flagging.
 */
export function checkNearZeroVariance(input: CheckInput): DetectionFlag | null {
  const { columnId, values } = input
  if (values.length < 5) return null

  const nums: number[] = []
  for (const v of values) {
    if (v === null) continue
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(n) && isFinite(n)) nums.push(n)
  }

  if (nums.length < 5) return null

  // Skip if constant (handled by checkConstantColumn)
  const unique = new Set(nums)
  if (unique.size <= 1) return null

  const mean = nums.reduce((s, v) => s + v, 0) / nums.length
  const sd = Math.sqrt(nums.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (nums.length - 1))

  // Edge case: mean is 0 or near 0 → use SD threshold directly
  let isNearZero = false
  let cv = 0
  if (Math.abs(mean) < 0.001) {
    isNearZero = sd < 0.1
    cv = 0
  } else {
    cv = sd / Math.abs(mean)
    isNearZero = cv < 0.05
  }

  if (!isNearZero) return null

  return {
    id: `nzvar_${columnId}_${Date.now()}`,
    type: 'near_zero_variance',
    columnId,
    severity: 'warning',
    source: 'statistical',
    confidence: Math.min(1 - cv * 10, 0.95),
    message: `This column has near-zero variance (SD = ${sd.toFixed(4)}, CV = ${cv.toFixed(4)}). Results from correlation and regression will be unstable.`,
    suggestion: 'Consider excluding this column from multivariate analyses, or verify the data is correct.',
    detail: { cv, sd, mean, nUnique: unique.size },
    timestamp: Date.now(),
  }
}

// ============================================================
// Dataset-level: Duplicate row detection
// ============================================================

/**
 * Detect duplicate rows across all columns in a dataset.
 * Serializes each row as a JSON string, counts duplicates.
 * Returns a DetectionFlag if any duplicates found.
 *
 * Call this with all columns from PastedData, not per-column.
 */
export function checkDuplicateRows(
  columns: Array<{ id: string; values: (number | string | null)[] }>
): DetectionFlag | null {
  if (columns.length === 0) return null
  const nRows = columns[0].values.length
  if (nRows < 2) return null

  const rowStrings = new Map<string, number>()
  let duplicateCount = 0

  for (let r = 0; r < nRows; r++) {
    const rowKey = columns.map((col) => {
      const v = col.values[r]
      return v === null ? '\0' : String(v)
    }).join('|')

    const count = (rowStrings.get(rowKey) ?? 0) + 1
    rowStrings.set(rowKey, count)
    if (count === 2) duplicateCount++ // count each duplicated row set once
  }

  // Count total duplicate rows (all extra copies)
  let totalDuplicateRows = 0
  for (const count of rowStrings.values()) {
    if (count > 1) totalDuplicateRows += count - 1
  }

  if (totalDuplicateRows === 0) return null

  return {
    id: `dupes_${Date.now()}`,
    type: 'duplicate_rows',
    columnId: '_dataset',
    severity: 'critical',
    source: 'statistical',
    confidence: 1.0,
    message: `${totalDuplicateRows} duplicate row(s) detected (${duplicateCount} unique row pattern(s) repeated). Duplicate rows inflate sample size and bias variance estimates.`,
    suggestion: 'Review and remove duplicate rows before analysis. Common cause: accidental SQL JOINs in data export.',
    detail: { duplicateCount, totalDuplicateRows, totalRows: nRows },
    timestamp: Date.now(),
  }
}

// ============================================================
// Dataset-level: Row alignment validation
// ============================================================

export interface RowAlignmentResult {
  valid: boolean
  expectedLength: number
  violatingColumns: Array<{ id: string; name: string; length: number }>
}

/**
 * Validate that all columns have the same row count.
 * Row index N must always refer to the same respondent across all columns.
 */
export function validateRowAlignment(
  columns: Array<{ id: string; name: string; rawValues: (number | string | null)[] }>
): RowAlignmentResult {
  if (columns.length === 0) return { valid: true, expectedLength: 0, violatingColumns: [] }

  const expectedLength = columns[0].rawValues.length
  const violating = columns
    .filter((c) => c.rawValues.length !== expectedLength)
    .map((c) => ({ id: c.id, name: c.name, length: c.rawValues.length }))

  return {
    valid: violating.length === 0,
    expectedLength,
    violatingColumns: violating,
  }
}

/**
 * Raise a critical detection flag if row alignment is violated.
 */
export function checkRowAlignment(
  columns: Array<{ id: string; name: string; rawValues: (number | string | null)[] }>
): DetectionFlag | null {
  const result = validateRowAlignment(columns)
  if (result.valid) return null

  return {
    id: `align_${Date.now()}`,
    type: 'row_alignment_violation',
    columnId: '_dataset',
    severity: 'critical',
    source: 'statistical',
    confidence: 1.0,
    message: `Columns have different row counts (expected ${result.expectedLength}). Row alignment violated — data is malformed.`,
    suggestion: 'All columns must have the same number of rows. Check the paste source for truncated or extra rows.',
    detail: {
      expectedLength: result.expectedLength,
      violatingColumns: result.violatingColumns,
    },
    timestamp: Date.now(),
  }
}

// ============================================================
// Straight-line response detection (matrix blocks)
// ============================================================

/**
 * Detect respondents who gave identical answers across all items in a matrix block.
 * Only runs on matrix-type blocks with 4+ columns.
 * Returns a warning flag if > 10% of respondents are straight-liners.
 */
export function checkStraightLiners(
  columns: Array<{ rawValues: (number | string | null)[] }>,
  questionType: string
): DetectionFlag | null {
  if (questionType !== 'matrix') return null
  if (columns.length < 4) return null

  const nRows = columns[0]?.rawValues.length ?? 0
  if (nRows < 10) return null

  let straightLinerCount = 0
  let respondentsWithResponses = 0

  for (let r = 0; r < nRows; r++) {
    const nonNullValues: (number | string)[] = []
    for (const col of columns) {
      const v = col.rawValues[r]
      if (v !== null && v !== undefined) nonNullValues.push(v)
    }

    // Need at least 4 non-null responses to count
    if (nonNullValues.length < 4) continue

    respondentsWithResponses++

    // Check if all non-null values are identical
    const first = nonNullValues[0]
    const allSame = nonNullValues.every((v) => v === first)
    if (allSame) straightLinerCount++
  }

  if (respondentsWithResponses === 0) return null

  const pct = straightLinerCount / respondentsWithResponses
  if (pct <= 0.10) return null

  return {
    id: `straight_${Date.now()}`,
    type: 'straight_line_responses',
    columnId: '_matrix_block',
    severity: 'warning',
    source: 'statistical',
    confidence: Math.min(pct * 2, 0.95),
    message: `${(pct * 100).toFixed(0)}% of respondents (${straightLinerCount} of ${respondentsWithResponses}) gave identical answers across all ${columns.length} items. This may indicate disengaged responses that inflate reliability scores.`,
    suggestion: 'Review these respondents before running reliability (Cronbach α) or factor analysis. Consider flagging or excluding them.',
    detail: {
      count: straightLinerCount,
      pct,
      threshold: 0.10,
      totalRespondents: respondentsWithResponses,
      nItems: columns.length,
    },
    timestamp: Date.now(),
  }
}

// ============================================================
// Internal math helpers (no jstat dependency — keep detection standalone)
// ============================================================

interface NumericExtract {
  values: number[]
  indices: number[]   // original row indices
  length: number
}

/** Extract numeric values with their original indices */
function extractNumeric(values: (number | string | null)[]): NumericExtract {
  const nums: number[] = []
  const indices: number[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === null) continue
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(n) && isFinite(n)) {
      nums.push(n)
      indices.push(i)
    }
  }
  return { values: nums, indices, length: nums.length }
}

/** Pearson r between two arrays, aligned by shared indices */
function pearsonR(
  a: number[],
  b: number[],
  aIdx: number[],
  bIdx: number[]
): number | null {
  // Build index lookup for b
  const bMap = new Map<number, number>()
  for (let i = 0; i < bIdx.length; i++) bMap.set(bIdx[i], b[i])

  // Align on shared indices
  const xa: number[] = []
  const xb: number[] = []
  for (let i = 0; i < aIdx.length; i++) {
    const bVal = bMap.get(aIdx[i])
    if (bVal !== undefined) {
      xa.push(a[i])
      xb.push(bVal)
    }
  }

  return rawPearson(xa, xb)
}

/** Raw Pearson correlation on two aligned arrays */
function rawPearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length)
  if (n < 3) return null

  let sumX = 0, sumY = 0
  for (let i = 0; i < n; i++) { sumX += x[i]; sumY += y[i] }
  const mX = sumX / n
  const mY = sumY / n

  let num = 0, dX = 0, dY = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mX
    const dy = y[i] - mY
    num += dx * dy
    dX += dx * dx
    dY += dy * dy
  }

  if (dX === 0 || dY === 0) return 0
  return num / Math.sqrt(dX * dY)
}
