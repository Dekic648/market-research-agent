/**
 * All shared domain types for the v2 platform.
 * Source of truth — never redefine these elsewhere.
 */

// ============================================================
// Question & Column Types
// ============================================================

export type QuestionType =
  | 'rating'
  | 'matrix'
  | 'checkbox'
  | 'radio'
  | 'category'
  | 'behavioral'
  | 'verbatim'        // free text — emits 'text' capability, never numeric
  | 'timestamped'     // date/time — emits 'temporal' capability
  | 'multi_assigned'  // pipe/comma-separated codes — explodes to binary matrix
  | 'weight'          // respondent weight column

export type BehavioralSubtype =
  | 'proportion'      // range [0,1], continuous
  | 'spend'           // zero-inflated, right-skewed
  | 'count'           // non-negative integers
  | 'ordinal_rank'    // integers with natural order, small range (e.g. 1-10)
  | 'metric'          // general continuous

export type CategorySubtype =
  | 'nominal'         // pure categorical, no order
  | 'prefixed_ordinal' // strings like "0) NonPayer", "3) Dolphin"
  | 'geo'             // country, region, city
  | 'constant'        // nUnique = 1 — excluded from analysis

export interface ColumnFingerprint {
  columnId: string
  hash: string
  nRows: number
  nUnique: number
  nMissing: number
  numericRatio: number
  min: number | null
  max: number | null
  mean: number | null
  sd: number | null
  topValues: Array<{ value: string | number; count: number }>
  computedAt: number
}

export interface FingerprintDiff {
  columnId: string
  added: number
  removed: number
  changed: number
  prevHash: string
  nextHash: string
}

export interface DetectionSource {
  source: 'statistical' | 'semantic'
  type: string
  confidence: number
  detail: string
  timestamp: number
}

export type TransformType =
  | 'reverseCode'
  | 'labelMap'
  | 'computeVariable'
  | 'recodeRange'
  | 'logTransform'
  | 'zScore'
  | 'winsorize'
  | 'interactionTerm'
  | 'singleValueOverride'

export interface Transform {
  id: string
  type: TransformType
  params: Record<string, unknown>
  enabled: boolean
  createdAt: number
  createdBy: string          // 'user' | 'auto-detected' | userId
  source: 'user' | 'auto-detected'
}

export type NullMeaning = 'not_chosen' | 'not_asked' | 'missing'

export interface ColumnDefinition {
  id: string
  name: string
  type: QuestionType
  subtype?: BehavioralSubtype | CategorySubtype  // refined classification (legacy, kept for compat)
  behavioralSubtype?: BehavioralSubtype
  categorySubtype?: CategorySubtype
  nRows: number
  nMissing: number
  // NULL SEMANTICS — always check nullMeaning before analyzing a column.
  // 'not_chosen': null counts as 0. Use rowCount as denominator. Never impute.
  // 'not_asked':  null means excluded. Use non-null count as denominator. Never impute.
  // 'missing':    null means unknown. Each analysis uses available (non-null) values.
  // Columns with nullMeaning 'not_chosen' or 'not_asked' are excluded from missing data diagnostics.
  nullMeaning: NullMeaning
  rawValues: (number | string | null)[]     // immutable after parse — NEVER written to after adapter
  imputedValues?: (number | string | null)[] // set by MICE — used by resolveColumn when nullMeaning === 'missing'
  fingerprint: ColumnFingerprint | null      // null until fingerprint phase
  semanticDetectionCache: DetectionSource[] | null
  transformStack: Transform[]               // empty array until transform phase
  sensitivity: 'anonymous' | 'pseudonymous' | 'personal'  // default: 'anonymous'
  declaredScaleRange: [number, number] | null
}

// ============================================================
// Data Groups & Parsed Data
// ============================================================

export interface DataGroup {
  questionType: QuestionType
  columns: ColumnDefinition[]
  label: string
  scaleRange?: [number, number]
}

export interface PastedData {
  groups: DataGroup[]
  segments?: ColumnDefinition
}

// ============================================================
// Question Blocks — user-defined question units (multi-box entry)
// ============================================================

export interface QuestionBlock {
  id: string
  label: string                     // user-editable, e.g. "Q3: Overall Satisfaction"
  questionType: QuestionType
  columns: ColumnDefinition[]
  scaleRange?: [number, number]
  role: 'question' | 'segment' | 'weight'
  confirmed: boolean                // user explicitly confirmed the type classification
  pastedAt: number
}

// ============================================================
// Analysis Tasks — Layer 2 (between data entry and execution)
// ============================================================

/** Reference to a specific column within a QuestionBlock */
export interface ColumnRef {
  questionBlockId: string
  columnId: string
}

/** A typed analysis task — proposed by TaskProposer, executed by runner */
export interface AnalysisTask {
  id: string
  pluginId: string
  label: string                     // "Frequency: Q2 Service Attributes"
                                    // "Driver: Overall SAT ~ Quality + Price + Speed"

  inputs: {
    columns: ColumnRef[]            // primary data columns for this task
    segment?: ColumnRef             // grouping variable (if task needs one)
    outcome?: ColumnRef             // for regression/driver — separate from columns
    weights?: ColumnRef             // for weighted analysis
  }

  sourceQuestionIds: string[]       // which QuestionBlocks contribute columns
  dependsOn: string[]               // task IDs that must complete first
  proposedBy: 'system' | 'user'
  reason: string                    // "Matrix scale with 5 items → reliability analysis"
  source?: string                   // 'cross_type_bridge' for survey×behavioral proposals

  status: 'proposed' | 'confirmed' | 'skipped'
        | 'running' | 'complete' | 'failed'
}

// ============================================================
// Dataset Graph
// ============================================================

export interface SubgroupFilter {
  id: string
  label: string                     // e.g. "Detractors"
  columnId: string                  // the filter column
  operator: 'lte' | 'gte' | 'lt' | 'gt' | 'eq' | 'neq' | 'in'
  value: number | string | (number | string)[]
  effectiveN: number                // computed at filter creation time
  source: 'auto' | 'manual'        // 'auto' = created by routing detector, 'manual' = user-defined
}

export interface DatasetNode {
  id: string
  label: string
  parsedData: PastedData
  rowCount: number                  // canonical respondent count — read this, not rawValues.length
  weights: ColumnDefinition | null
  readonly: boolean
  source: 'user' | 'platform_benchmark' | 'imported_reference'
  dataVersion: number       // increment on every re-paste
  createdAt: number
  activeSubgroup: SubgroupFilter | null
}

export interface DatasetEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationship: 'same_survey' | 'wave_comparison' | 'external_reference' | 'benchmark'
  alignmentKey: string | null
  alignmentValid: boolean
}

export interface DatasetGraph {
  nodes: DatasetNode[]
  edges: DatasetEdge[]
}

// ============================================================
// Analysis Log
// ============================================================

export type LogEntryType =
  // Data events
  | 'parse_completed'
  | 'fingerprint_computed'
  | 'fingerprint_diff'
  | 'repaste_detected'
  | 'column_rename_migrated'
  // Detection events
  | 'detection_flag_raised'
  | 'detection_flag_acknowledged'
  | 'detection_flag_dismissed'
  // Transformation events
  | 'transform_added'
  | 'transform_toggled'
  | 'transform_removed'
  | 'transform_snapshot'
  | 'missing_strategy_declared'
  // Analysis events
  | 'analysis_run'
  | 'analysis_failed'
  | 'assumption_violation'
  | 'sampling_applied'
  | 'imputation_applied'
  | 'weight_validation_failed'
  // Findings events
  | 'finding_added'
  | 'finding_suppressed'
  | 'finding_reordered'
  | 'fdr_correction_applied'
  // Verification events
  | 'verification_result'
  // Session events
  | 'session_saved'
  | 'session_loaded'
  | 'session_exported'

export interface AnalysisLogEntry {
  id: string
  type: LogEntryType
  timestamp: number
  userId: string              // 'anonymous' until auth — never null, never omit
  dataFingerprint: string     // hash of resolved data at this moment — never omit
  dataVersion: number         // DatasetNode.dataVersion — never omit
  sessionId: string
  payload: Record<string, unknown>
}

// ============================================================
// Findings
// ============================================================

export interface SubgroupContext {
  label: string        // "Detractors"
  condition: string    // "Overall rating ≤ 4"
  n: number            // 60
  totalN: number       // 200
}

export interface Finding {
  id: string
  stepId: string
  type: string
  title: string
  summary: string
  detail: string
  significant: boolean
  pValue: number | null
  adjustedPValue: number | null   // after FDR correction
  effectSize: number | null
  effectLabel: string | null
  theme: string | null
  suppressed: boolean
  priority: number
  createdAt: number
  dataVersion: number
  dataFingerprint: string
  verificationResults?: VerificationResult[]
  subgroupContext?: SubgroupContext | null
  weightedBy?: string
}

export interface VerificationResult {
  findingId: string
  checkType: 'simpsons_paradox' | 'moderation_check'
  severity: 'warning' | 'info'
  detail: Record<string, unknown>
  message: string
}

// ============================================================
// Session
// ============================================================

export interface StepResult {
  stepId: string
  pluginId: string
  result: Record<string, unknown>
  timestamp: number
  dataVersion: number
  dataFingerprint: string
}

export interface SessionState {
  sessionId: string
  currentFlowIndex: number
  stepResults: StepResult[]
  activeDatasetNodeId: string | null
}

// ============================================================
// Chart
// ============================================================

export type ChartType =
  | 'divergingStackedBar'
  | 'groupedBar'
  | 'horizontalBar'
  | 'significanceMap'
  | 'heatmap'
  | 'betaImportance'
  | 'radarChart'
  | 'boxPlot'
  | 'scatterPlot'
  | 'stackedPercentBar'
  | 'histogram'

export interface ChartEdits {
  title?: string
  xAxisLabel?: string
  yAxisLabel?: string
  colors?: string[]
  legendPosition?: 'top' | 'bottom' | 'right'
}

export interface ChartConfig {
  id: string
  type: ChartType
  data: unknown[]               // Plotly.Data[] — typed loosely until Plotly is added
  layout: Record<string, unknown>
  config: Record<string, unknown>
  stepId: string
  edits: ChartEdits
}
