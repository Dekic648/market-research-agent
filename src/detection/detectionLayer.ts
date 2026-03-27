/**
 * DetectionLayer — orchestrator for statistical + semantic checks.
 *
 * Agreement/disagreement logic:
 *   - Both agree → high-confidence flag
 *   - Only statistical → medium-confidence flag
 *   - Only semantic → medium-confidence flag
 *   - Disagree → surface both to user, let them decide
 *
 * Every flag is logged to AnalysisLog regardless of user action.
 * Detection is passive — user can ignore flags and proceed.
 */

import type { DetectionFlag, DetectionResult, CheckInput } from './types'
import { runStatisticalChecks } from './statisticalChecks'
import {
  runSemanticCheck,
  runSemanticCheckBatch,
  type SemanticCheckInput,
  type SemanticResult,
} from './semanticChecks'
import type { ColumnDefinition } from '../types/dataTypes'

// ============================================================
// Types
// ============================================================

export interface DetectionLayerInput {
  /** Columns to check */
  columns: ColumnDefinition[]
  /** Scale group info — which columns are peers */
  scaleGroups?: Array<{
    label: string
    columnIds: string[]
  }>
}

export interface MergedFlag extends DetectionFlag {
  /** Sources that produced this flag */
  sources: Array<'statistical' | 'semantic'>
  /** Agreement status between statistical and semantic */
  agreement: 'both_agree' | 'statistical_only' | 'semantic_only' | 'disagree'
}

export interface DetectionLayerResult {
  flags: MergedFlag[]
  /** Per-column semantic results for caching in ColumnDefinition */
  semanticCache: Map<string, SemanticResult>
  durationMs: number
  checkedAt: number
}

// ============================================================
// Main orchestrator
// ============================================================

/**
 * Run the full detection pipeline on a set of columns.
 *
 * 1. Statistical checks (sync, < 100ms per column)
 * 2. Semantic checks (async, Claude API, one call per scale group)
 * 3. Merge and reconcile flags
 */
export async function runDetection(
  input: DetectionLayerInput
): Promise<DetectionLayerResult> {
  const startTime = performance.now()
  const { columns, scaleGroups } = input

  // Build peer lookup from scale groups
  const peerMap = buildPeerMap(columns, scaleGroups)

  // Build all-columns lookup for computed column detection
  const allColumnsData = columns.map((c) => ({
    columnId: c.id,
    values: c.rawValues,
  }))

  // ----------------------------------------------------------------
  // Phase 1: Statistical checks (synchronous)
  // ----------------------------------------------------------------
  const statisticalFlags: DetectionFlag[] = []

  for (const col of columns) {
    const checkInput: CheckInput = {
      columnId: col.id,
      columnName: col.name,
      values: col.rawValues,
      peerColumns: peerMap.get(col.id),
      allColumns: allColumnsData,
      declaredScaleRange: col.declaredScaleRange,
    }
    const flags = runStatisticalChecks(checkInput)
    statisticalFlags.push(...flags)
  }

  // ----------------------------------------------------------------
  // Phase 2: Semantic checks (async, per scale group)
  // ----------------------------------------------------------------
  const semanticCache = new Map<string, SemanticResult>()
  const semanticFlags: DetectionFlag[] = []

  if (scaleGroups && scaleGroups.length > 0) {
    for (const group of scaleGroups) {
      const groupColumns = group.columnIds
        .map((id) => columns.find((c) => c.id === id))
        .filter((c): c is ColumnDefinition => c !== undefined)

      const batchInputs: SemanticCheckInput[] = groupColumns.map((col) => ({
        columnId: col.id,
        columnName: col.name,
        sensitivity: col.sensitivity,
        cachedResult: col.semanticDetectionCache
          ? semanticCacheToResult(col.semanticDetectionCache)
          : null,
        sampleValues: extractSamples(col.rawValues),
        scaleGroupLabel: group.label,
        peerColumnNames: groupColumns
          .filter((c) => c.id !== col.id)
          .map((c) => c.name),
      }))

      const results = await runSemanticCheckBatch(batchInputs)

      for (const [columnId, { flag, result }] of results) {
        semanticCache.set(columnId, result)
        if (flag) semanticFlags.push(flag)
      }
    }
  } else {
    // No scale groups — run individual semantic checks on each column
    for (const col of columns) {
      const semInput: SemanticCheckInput = {
        columnId: col.id,
        columnName: col.name,
        sensitivity: col.sensitivity,
        cachedResult: col.semanticDetectionCache
          ? semanticCacheToResult(col.semanticDetectionCache)
          : null,
        sampleValues: extractSamples(col.rawValues),
      }

      const semResult = await runSemanticCheck(semInput)
      if (semResult) {
        semanticCache.set(col.id, semResult.result)
        if (semResult.flag) semanticFlags.push(semResult.flag)
      }
    }
  }

  // ----------------------------------------------------------------
  // Phase 3: Merge and reconcile
  // ----------------------------------------------------------------
  const mergedFlags = mergeFlags(statisticalFlags, semanticFlags)

  const durationMs = performance.now() - startTime

  return {
    flags: mergedFlags,
    semanticCache,
    durationMs,
    checkedAt: Date.now(),
  }
}

/**
 * Run statistical checks only (no API calls).
 * Use when semantic checks are disabled or for quick detection.
 */
export function runDetectionStatisticalOnly(
  input: DetectionLayerInput
): DetectionResult {
  const startTime = performance.now()
  const { columns, scaleGroups } = input

  const peerMap = buildPeerMap(columns, scaleGroups)
  const allColumnsData = columns.map((c) => ({
    columnId: c.id,
    values: c.rawValues,
  }))

  const flags: DetectionFlag[] = []

  for (const col of columns) {
    const checkInput: CheckInput = {
      columnId: col.id,
      columnName: col.name,
      values: col.rawValues,
      peerColumns: peerMap.get(col.id),
      allColumns: allColumnsData,
      declaredScaleRange: col.declaredScaleRange,
    }
    flags.push(...runStatisticalChecks(checkInput))
  }

  return {
    flags,
    durationMs: performance.now() - startTime,
    checkedAt: Date.now(),
  }
}

// ============================================================
// Merge logic — agreement / disagreement
// ============================================================

/**
 * Merge statistical and semantic flags.
 *
 * For reverse_coded flags (the only type that can come from both sources):
 *   - Both flagged same column → 'both_agree', boost confidence
 *   - Only statistical → 'statistical_only'
 *   - Only semantic → 'semantic_only'
 *   - Statistical says yes, semantic says no (or vice versa) → 'disagree'
 *
 * All other flag types only come from statistical checks — pass through as-is.
 */
function mergeFlags(
  statistical: DetectionFlag[],
  semantic: DetectionFlag[]
): MergedFlag[] {
  const merged: MergedFlag[] = []

  // Index semantic flags by columnId + type
  const semanticByKey = new Map<string, DetectionFlag>()
  for (const f of semantic) {
    semanticByKey.set(`${f.columnId}:${f.type}`, f)
  }

  // Track which semantic flags got merged
  const mergedSemanticKeys = new Set<string>()

  // Process statistical flags
  for (const sf of statistical) {
    const key = `${sf.columnId}:${sf.type}`
    const semMatch = semanticByKey.get(key)

    if (semMatch) {
      // Both agree — boost confidence
      mergedSemanticKeys.add(key)
      merged.push({
        ...sf,
        confidence: Math.min(1, (sf.confidence + semMatch.confidence) / 1.5),
        message: `Both statistical and semantic analysis agree: ${sf.message}`,
        sources: ['statistical', 'semantic'],
        agreement: 'both_agree',
        detail: {
          ...sf.detail,
          semanticDetail: semMatch.detail,
        },
      })
    } else {
      // Statistical only
      merged.push({
        ...sf,
        sources: ['statistical'],
        agreement: sf.type === 'reverse_coded' ? 'statistical_only' : 'statistical_only',
      })
    }
  }

  // Add semantic-only flags (not merged with any statistical flag)
  for (const semf of semantic) {
    const key = `${semf.columnId}:${semf.type}`
    if (!mergedSemanticKeys.has(key)) {
      merged.push({
        ...semf,
        sources: ['semantic'],
        agreement: 'semantic_only',
      })
    }
  }

  // Sort: critical first, then warning, then info; within severity by confidence desc
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  merged.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity]
    if (sevDiff !== 0) return sevDiff
    return b.confidence - a.confidence
  })

  return merged
}

// ============================================================
// Helpers
// ============================================================

/** Build a map of columnId → peer columns for correlation checks */
function buildPeerMap(
  columns: ColumnDefinition[],
  scaleGroups?: Array<{ label: string; columnIds: string[] }>
): Map<string, Array<{ columnId: string; values: (number | string | null)[] }>> {
  const peerMap = new Map<string, Array<{ columnId: string; values: (number | string | null)[] }>>()

  if (!scaleGroups) return peerMap

  for (const group of scaleGroups) {
    for (const colId of group.columnIds) {
      const peers = group.columnIds
        .filter((id) => id !== colId)
        .map((id) => {
          const col = columns.find((c) => c.id === id)
          return col ? { columnId: col.id, values: col.rawValues } : null
        })
        .filter((p): p is { columnId: string; values: (number | string | null)[] } => p !== null)

      peerMap.set(colId, peers)
    }
  }

  return peerMap
}

/** Extract first N non-null sample values from a column */
function extractSamples(values: (number | string | null)[], n = 5): (number | string)[] {
  const samples: (number | string)[] = []
  for (const v of values) {
    if (v !== null && samples.length < n) samples.push(v)
  }
  return samples
}

/** Convert DetectionSource[] cache to SemanticResult (if any semantic entry exists) */
function semanticCacheToResult(
  cache: Array<{ source: string; type: string; confidence: number; detail: string; timestamp: number }>
): SemanticResult | null {
  const sem = cache.find((c) => c.source === 'semantic')
  if (!sem) return null

  // Best-effort reconstruction from the cached detail string
  try {
    const detail = JSON.parse(sem.detail)
    return {
      isReverseCoded: detail.isReverseCoded ?? false,
      confidence: sem.confidence,
      reasoning: detail.reasoning ?? '',
      questionIntent: detail.questionIntent ?? '',
      scaleDirection: detail.scaleDirection ?? 'unclear',
      cachedAt: sem.timestamp,
    }
  } catch {
    return null
  }
}
