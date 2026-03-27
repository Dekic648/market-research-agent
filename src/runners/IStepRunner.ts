/**
 * IStepRunner — shared interface for both runner modes.
 *
 * InteractiveRunner and HeadlessRunner both implement this.
 * The interface is identical — the decision only affects which mode
 * is the default entry point in the UI.
 */

import type { AnalysisPlugin, PluginStepResult, AssumptionCheck } from '../plugins/types'
import type { Finding } from '../types/dataTypes'

export interface AssumptionViolation {
  pluginId: string
  pluginTitle: string
  check: AssumptionCheck
}

export interface RunProgress {
  current: number
  total: number
  pluginId: string
  pluginTitle: string
}

export interface RunResult {
  stepResults: PluginStepResult[]
  findings: Finding[]
  violations: AssumptionViolation[]
  completedPlugins: string[]
  skippedPlugins: string[]
  durationMs: number
}

export interface IStepRunner {
  /**
   * Run a single plugin and return its result.
   */
  runOne(plugin: AnalysisPlugin): Promise<PluginStepResult>

  /**
   * Run a sequence of plugins.
   */
  runAll(plugins: AnalysisPlugin[]): Promise<RunResult>

  /**
   * Progress callback — called after each plugin completes.
   */
  onProgress?: (progress: RunProgress) => void

  /**
   * Violation callback — called when a precondition fails.
   */
  onViolation?: (violation: AssumptionViolation) => void
}
