/**
 * InteractiveRunner — awaits human review between steps.
 *
 * - Does NOT auto-advance — each step must be explicitly triggered
 * - Assumption violations shown inline — user decides whether to proceed
 * - Stores each result immediately in session
 * - Progress reported via onProgress callback
 */

import type { AnalysisPlugin, PluginStepResult, ResolvedColumnData } from '../plugins/types'
import type { Finding, ColumnDefinition, AnalysisLogEntry } from '../types/dataTypes'
import { PostAnalysisVerifier } from '../engine/PostAnalysisVerifier'
import type {
  IStepRunner, RunResult, RunProgress, AssumptionViolation,
} from './IStepRunner'

interface InteractiveRunnerConfig {
  /** Resolved column data — from resolveColumn(), never rawValues */
  data: ResolvedColumnData
  /** Optional weights array */
  weights?: number[]
  /** Session metadata for log entries */
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

export class InteractiveRunner implements IStepRunner {
  private config: InteractiveRunnerConfig

  /** Accumulated log entries — caller writes these to AnalysisLog store */
  readonly logEntries: Partial<AnalysisLogEntry>[] = []

  onProgress?: (progress: RunProgress) => void
  onViolation?: (violation: AssumptionViolation) => void

  constructor(config: InteractiveRunnerConfig) {
    this.config = config
  }

  /**
   * Run a single plugin. In interactive mode, this is called one at a time
   * by the UI when the user clicks NextStepButton.
   */
  async runOne(plugin: AnalysisPlugin): Promise<PluginStepResult> {
    // Check preconditions — surface violations but do NOT block
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
      }
    }

    // Run the plugin
    const result = await plugin.run(this.config.data, this.config.weights)

    // Complete the log entry with session metadata
    result.logEntry = {
      ...result.logEntry,
      userId: this.config.userId,
      dataFingerprint: this.config.dataFingerprint,
      dataVersion: this.config.dataVersion,
      sessionId: this.config.sessionId,
    }

    // Attach violations to assumptions
    result.assumptions = [
      ...result.assumptions,
      ...violations.map((v) => v.check),
    ]

    return result
  }

  /**
   * Run all plugins in sequence. In interactive mode, this is typically
   * NOT used — runOne() is called per step. But available for completeness.
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

        // Convert finding inputs to full findings
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

        // Collect violations
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
      }
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
