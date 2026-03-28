/**
 * AnalysisPlugin contract — every analysis is self-describing,
 * self-testing, and self-registering.
 */

import type { ChartConfig, Finding, AnalysisLogEntry, NullMeaning } from '../types/dataTypes'

// ============================================================
// Data capabilities — what CapabilityMatcher resolves
// ============================================================

export type DataCapability =
  | 'continuous'
  | 'categorical'
  | 'ordinal'
  | 'binary'
  | 'segment'
  | 'repeated'
  | 'n>30'
  | 'n>100'
  | 'text'
  | 'temporal'
  | 'multiple_response'
  | 'weighted'

export type CapabilitySet = Set<DataCapability>

// ============================================================
// Resolved data — what plugins receive (never rawValues)
// ============================================================

export interface ResolvedColumn {
  id: string
  name: string
  values: (number | string | null)[]
  nullMeaning?: NullMeaning
}

export interface ResolvedColumnData {
  /** Primary columns for analysis (e.g., scale items) */
  columns: ResolvedColumn[]
  /** Segment/grouping column, if present */
  segment?: ResolvedColumn
  /** Number of rows */
  n: number
  /** Canonical respondent count from DatasetNode — used as denominator for 'not_chosen' columns */
  rowCount?: number
  /** Respondent weights — when present, analyses should weight observations */
  weights?: number[]
  /** Name of the weight column — for display on findings */
  weightColumnName?: string
}

// ============================================================
// Step result — all plugins return this
// ============================================================

export interface PluginStepResult {
  pluginId: string
  data: Record<string, unknown>
  charts: ChartConfig[]
  findings: FindingInput[]
  plainLanguage: string
  assumptions: AssumptionCheck[]
  /** Caller completes with userId, dataFingerprint, dataVersion */
  logEntry: Partial<AnalysisLogEntry>
}

export interface FindingFlag {
  type: string
  severity: 'info' | 'warning' | 'critical'
  detail: Record<string, unknown>
  message: string
}

export interface FindingInput {
  type: string
  title: string
  summary: string
  detail: string
  significant: boolean
  pValue: number | null
  effectSize: number | null
  effectLabel: string | null
  theme: string | null
  flags?: FindingFlag[]
  /** Punchy 1-2 sentence summary for TLDR. Falls back to first sentence of summary if not set. */
  summaryLanguage?: string
}

export interface AssumptionCheck {
  name: string
  passed: boolean
  message: string
  severity: 'info' | 'warning' | 'critical'
}

// ============================================================
// Validator — precondition checked BEFORE plugin.run()
// ============================================================

export interface Validator {
  name: string
  validate(data: ResolvedColumnData): AssumptionCheck
}

// ============================================================
// Output contract — typed shape of StepResult.data
// ============================================================

export interface OutputContract {
  description: string
  fields: Record<string, string>   // field name → type description
}

// ============================================================
// AnalysisPlugin — the contract
// ============================================================

export interface AnalysisPlugin {
  id: string
  title: string
  desc: string
  priority: number                  // lower = runs earlier in flow
  reportPriority: number            // lower = appears earlier in report output

  requires: DataCapability[]
  forbids?: DataCapability[]        // plugin excluded if ANY of these capabilities present
  dependsOn?: string[]              // plugin IDs that must run first

  preconditions: Validator[]

  run(data: ResolvedColumnData, weights?: number[]): Promise<PluginStepResult>

  produces: OutputContract

  plainLanguage(result: PluginStepResult): string
}
