/**
 * Typed Transform union — every transform type has explicit params.
 * resolveColumn() pattern-matches on these to apply transformations.
 *
 * All transforms share BaseTransform fields. The discriminant is `type`.
 */

export interface BaseTransform {
  id: string
  enabled: boolean
  createdAt: number
  createdBy: string          // 'user' | 'auto-detected' | userId
  source: 'user' | 'auto-detected'
}

// ============================================================
// Individual transform types
// ============================================================

/** Flip scale direction: newVal = scaleMin + scaleMax - oldVal */
export interface ReverseCodeTransform extends BaseTransform {
  type: 'reverseCode'
  params: {
    scaleMin: number
    scaleMax: number
  }
}

/** Map numeric codes to display labels (Stats Engine always receives numbers) */
export interface LabelMapTransform extends BaseTransform {
  type: 'labelMap'
  params: {
    map: Record<number, string | Record<string, string>>  // value → label or { locale: label }
  }
}

/** Compute a new variable from a formula across columns */
export interface ComputeVariableTransform extends BaseTransform {
  type: 'computeVariable'
  params: {
    formula: string                    // e.g. 'MEAN(Q1, Q2_r, Q3)'
    operation: 'mean' | 'sum' | 'diff' | 'custom'
    sourceColumnIds: string[]          // columns referenced in the formula
    outputColumnId: string
  }
}

/** Collapse scale points: remap value ranges to new values */
export interface RecodeRangeTransform extends BaseTransform {
  type: 'recodeRange'
  params: {
    rules: Array<{ from: number[]; to: number }>  // e.g. [{ from: [1,2], to: 1 }, { from: [4,5], to: 3 }]
  }
}

/** Log-transform: log(value + constant) */
export interface LogTransform extends BaseTransform {
  type: 'logTransform'
  params: {
    base: number         // Math.E for natural log, 10 for log10
    constant: number     // added before log to handle zeros (typically 1)
  }
}

/** Standardize to z-scores using the column's own mean and SD */
export interface ZScoreTransform extends BaseTransform {
  type: 'zScore'
  params: {
    mean: number         // pre-computed from fingerprint — not recomputed
    sd: number
  }
}

/** Cap extreme values at percentile thresholds */
export interface WinsorizeTransform extends BaseTransform {
  type: 'winsorize'
  params: {
    lowerPct: number     // e.g. 5 for 5th percentile
    upperPct: number     // e.g. 95 for 95th percentile
    lowerBound: number   // pre-computed value at lowerPct
    upperBound: number   // pre-computed value at upperPct
  }
}

/** Create an interaction term: columnA × columnB, optionally centered */
export interface InteractionTermTransform extends BaseTransform {
  type: 'interactionTerm'
  params: {
    columnAId: string
    columnBId: string
    centered: boolean
    meanA: number        // for centering
    meanB: number
    outputColumnId: string
  }
}

/** Override a single cell value by row index */
export interface SingleValueOverrideTransform extends BaseTransform {
  type: 'singleValueOverride'
  params: {
    rowIndex: number
    originalValue: number | string | null
    newValue: number | string | null
  }
}

// ============================================================
// Union type
// ============================================================

export type TypedTransform =
  | ReverseCodeTransform
  | LabelMapTransform
  | ComputeVariableTransform
  | RecodeRangeTransform
  | LogTransform
  | ZScoreTransform
  | WinsorizeTransform
  | InteractionTermTransform
  | SingleValueOverrideTransform
