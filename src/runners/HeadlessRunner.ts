/**
 * HeadlessRunner — batch execution without UI interaction.
 *
 * UX DECISION: Option A — HeadlessRunner is a power-user shortcut.
 * Interactive mode remains the primary flow. HeadlessRunner is the
 * "Run All" button for analysts who want results without stepping through.
 *
 * KEY RULE: Assumption violations are NEVER silent.
 * - Every violation is written to AnalysisLog
 * - Every finding from a violated plugin is flagged
 * - Progress reported via onProgress callback
 * - Errors on individual plugins do NOT stop the pipeline
 */

import type { AnalysisPlugin, PluginStepResult, ResolvedColumnData } from '../plugins/types'
import type { Finding, AnalysisLogEntry, ColumnDefinition } from '../types/dataTypes'
import { PostAnalysisVerifier } from '../engine/PostAnalysisVerifier'
import type {
  IStepRunner, RunResult, RunProgress, AssumptionViolation,
} from './IStepRunner'

interface HeadlessRunnerConfig {
  data: ResolvedColumnData
  weights?: number[]
  userId: string
  dataFingerprint: string
  dataVersion: number
  sessionId: string
  /** Full column definitions for post-analysis verification (Simpson's, moderation) */
  allColumnDefinitions?: ColumnDefinition[]
  /** Segment columns for confound checks */
  segmentColumnDefinitions?: ColumnDefinition[]
  rowCount?: number
}

export class HeadlessRunner implements IStepRunner {
  private config: HeadlessRunnerConfig

  /** Accumulated log entries — caller writes these to AnalysisLog store */
  readonly logEntries: Partial<AnalysisLogEntry>[] = []

  /** True if BH correction was auto-applied after run */
  fdrAutoApplied = false

  onProgress?: (progress: RunProgress) => void
  onViolation?: (violation: AssumptionViolation) => void

  constructor(config: HeadlessRunnerConfig) {
    this.config = config
  }

  async runOne(plugin: AnalysisPlugin): Promise<PluginStepResult> {
    // Check preconditions
    const violations: AssumptionViolation[] = []
    for (const validator of plugin.preconditions) {
      const check = validator.validate(this.config.data)
      if (!check.passed) {
        const violation: AssumptionViolation = {
          pluginId: plugin.id,
          pluginTitle: plugin.title,
          check,
        }
        violations.push(violation)
        this.onViolation?.(violation)

        // Log every violation — NEVER silent
        this.logEntries.push({
          type: 'assumption_violation',
          userId: this.config.userId,
          dataFingerprint: this.config.dataFingerprint,
          dataVersion: this.config.dataVersion,
          sessionId: this.config.sessionId,
          payload: {
            pluginId: plugin.id,
            assumption: check.name,
            message: check.message,
            severity: check.severity,
          },
        })
      }
    }

    const result = await plugin.run(this.config.data, this.config.weights)

    // Complete log entry
    result.logEntry = {
      ...result.logEntry,
      userId: this.config.userId,
      dataFingerprint: this.config.dataFingerprint,
      dataVersion: this.config.dataVersion,
      sessionId: this.config.sessionId,
    }

    // Flag findings if preconditions were violated
    if (violations.length > 0) {
      for (const fi of result.findings) {
        fi.detail = `[ASSUMPTION VIOLATION: ${violations.map((v) => v.check.message).join('; ')}] ${fi.detail}`
      }
    }

    result.assumptions = [
      ...result.assumptions,
      ...violations.map((v) => v.check),
    ]

    this.logEntries.push(result.logEntry)

    return result
  }

  /**
   * Run all plugins without stopping. Errors on individual plugins
   * are caught and the plugin is skipped — the pipeline continues.
   */
  async runAll(plugins: AnalysisPlugin[]): Promise<RunResult> {
    const startTime = performance.now()
    const stepResults: PluginStepResult[] = []
    const allFindings: Finding[] = []
    const allViolations: AssumptionViolation[] = []
    const completedPlugins: string[] = []
    const skippedPlugins: string[] = []

    for (let i = 0; i < plugins.length; i++) {
      const plugin = plugins[i]

      this.onProgress?.({
        current: i + 1,
        total: plugins.length,
        pluginId: plugin.id,
        pluginTitle: plugin.title,
      })

      try {
        const result = await this.runOne(plugin)
        stepResults.push(result)
        completedPlugins.push(plugin.id)

        for (const fi of result.findings) {
          allFindings.push({
            id: `finding_${plugin.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            stepId: plugin.id,
            ...fi,
            adjustedPValue: null,
            suppressed: false,
            priority: allFindings.length,
            createdAt: Date.now(),
            dataVersion: this.config.dataVersion,
            dataFingerprint: this.config.dataFingerprint,
          })
        }

        for (const check of result.assumptions) {
          if (!check.passed) {
            allViolations.push({
              pluginId: plugin.id,
              pluginTitle: plugin.title,
              check,
            })
          }
        }
      } catch (err) {
        skippedPlugins.push(plugin.id)

        // Log the failure — never silent
        this.logEntries.push({
          type: 'analysis_failed',
          userId: this.config.userId,
          dataFingerprint: this.config.dataFingerprint,
          dataVersion: this.config.dataVersion,
          sessionId: this.config.sessionId,
          payload: {
            pluginId: plugin.id,
            error: err instanceof Error ? err.message : String(err),
          },
        })
      }
    }

    // Auto-apply FDR correction when ≥ 5 significance tests
    const sigFindings = allFindings.filter((f) => f.pValue !== null && f.pValue !== undefined)
    if (sigFindings.length >= 5) {
      // Apply Benjamini-Hochberg to the accumulated findings
      const m = sigFindings.length
      const sorted = [...sigFindings].sort((a, b) => (a.pValue ?? 1) - (b.pValue ?? 1))
      const adjustedMap = new Map<string, number>()
      let minSoFar = 1
      for (let i = m - 1; i >= 0; i--) {
        const rank = i + 1
        const raw = sorted[i].pValue ?? 1
        const adjusted = Math.min(minSoFar, (raw * m) / rank)
        minSoFar = adjusted
        adjustedMap.set(sorted[i].id, Math.min(1, adjusted))
      }
      for (const f of allFindings) {
        const adj = adjustedMap.get(f.id)
        if (adj !== undefined) f.adjustedPValue = adj
      }

      this.logEntries.push({
        type: 'fdr_correction_applied',
        userId: this.config.userId,
        dataFingerprint: this.config.dataFingerprint,
        dataVersion: this.config.dataVersion,
        sessionId: this.config.sessionId,
        payload: { method: 'bh', nTests: m },
      })

      this.fdrAutoApplied = true
    }

    // Post-analysis verification pass (Simpson's Paradox, moderation)
    if (this.config.allColumnDefinitions && this.config.segmentColumnDefinitions) {
      for (const finding of allFindings) {
        const results = PostAnalysisVerifier.run({
          finding,
          allColumns: this.config.allColumnDefinitions,
          segmentColumns: this.config.segmentColumnDefinitions,
          rowCount: this.config.rowCount ?? this.config.data.n,
        })
        for (const result of results) {
          finding.verificationResults = [...(finding.verificationResults ?? []), result]
          this.logEntries.push({
            type: 'verification_result',
            userId: this.config.userId,
            dataFingerprint: this.config.dataFingerprint,
            dataVersion: this.config.dataVersion,
            sessionId: this.config.sessionId,
            payload: {
              findingId: finding.id,
              checkType: result.checkType,
              severity: result.severity,
              message: result.message,
            },
          })
        }
      }
    }

    return {
      stepResults,
      findings: allFindings,
      violations: allViolations,
      completedPlugins,
      skippedPlugins,
      durationMs: performance.now() - startTime,
    }
  }
}
