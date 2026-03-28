/**
 * Data Preparation types.
 */

export interface MissingDataSummary {
  totalMissing: number
  totalCells: number
  pctMissing: number
  perColumn: Array<{
    columnId: string
    columnName: string
    nMissing: number
    pctMissing: number
  }>
  variablesAbove20pct: string[]
}

export interface LittlesMCARResult {
  chiSq: number
  df: number
  p: number
  interpretation: 'MCAR' | 'not_MCAR' | 'insufficient_data'
}

export interface PrepState {
  missingDiagnostics: MissingDataSummary | null
  littlesMCAR: LittlesMCARResult | null
  pendingFlagCount: number
  activeTransformCount: number
  readyToAnalyze: boolean
}

export interface ComputeFormulaInput {
  formula: string
  operation: 'mean' | 'sum' | 'diff' | 'custom'
  sourceColumnIds: string[]
  outputColumnName: string
}
