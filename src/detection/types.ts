/**
 * Detection types — shared by statistical and semantic checks.
 */

export type DetectionFlagType =
  | 'reverse_coded'           // item negatively correlated with scale peers
  | 'merged_header'           // double header row detected (Qualtrics/SurveyMonkey)
  | 'possible_computed'       // column is a linear combination of others (multicollinearity)
  | 'timestamp_column'        // date/time values detected
  | 'multi_assigned_codes'    // pipe/comma-separated codes in cells
  | 'collapsed_categories'    // fewer unique values than expected for declared scale range
  | 'skewed_distribution'     // heavy right-skew — log transform recommended
  | 'zero_inflated'           // high % zeros with positive tail — log(x+1) recommended
  | 'prefixed_ordinal_detected' // categorical values with digit prefix e.g. "0) NonPayer"
  | 'constant_column'         // only 1 unique value — exclude from all analysis
  | 'duplicate_rows'          // dataset contains duplicate rows — inflates n
  | 'near_zero_variance'      // column has near-zero variance — unstable in regression/correlation
  | 'row_alignment_violation'  // columns have different row counts — malformed dataset
  | 'straight_line_responses'  // >10% of respondents gave identical answers across matrix items

export type DetectionSeverity = 'info' | 'warning' | 'critical'

export interface DetectionFlag {
  id: string
  type: DetectionFlagType
  columnId: string
  severity: DetectionSeverity
  source: 'statistical' | 'semantic'
  confidence: number           // 0–1
  message: string              // human-readable explanation
  suggestion: string           // what to do about it
  detail: Record<string, unknown>  // type-specific data for UI
  timestamp: number
}

export interface DetectionResult {
  flags: DetectionFlag[]
  durationMs: number
  checkedAt: number
}

/** Input shape for statistical checks — one column's data + context */
export interface CheckInput {
  columnId: string
  columnName: string
  values: (number | string | null)[]
  /** Other columns in the same scale group (for correlation checks) */
  peerColumns?: Array<{
    columnId: string
    values: (number | string | null)[]
  }>
  /** All columns in the dataset (for computed column detection) */
  allColumns?: Array<{
    columnId: string
    values: (number | string | null)[]
  }>
  /** Declared scale range, if any */
  declaredScaleRange?: [number, number] | null
  /** Column sensitivity — checks 7+8 only fire on 'anonymous' */
  sensitivity?: 'anonymous' | 'pseudonymous' | 'personal'
  /** Column fingerprint — used by skew/zero-inflation checks */
  fingerprint?: { numericRatio: number; min: number | null; max: number | null; mean: number | null; sd: number | null; nMissing: number; nRows: number } | null
}
