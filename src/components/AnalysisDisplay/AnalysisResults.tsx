/**
 * AnalysisResults — renders all step results from a runner execution.
 */

import { StepCard } from './StepCard'
import type { RunResult } from '../../runners/IStepRunner'
import { AnalysisRegistry } from '../../plugins/AnalysisRegistry'
import './AnalysisDisplay.css'

interface AnalysisResultsProps {
  runResult: RunResult
}

export function AnalysisResults({ runResult }: AnalysisResultsProps) {
  const { stepResults, durationMs, completedPlugins, skippedPlugins } = runResult

  return (
    <div className="analysis-results">
      <div className="results-header card">
        <div className="results-summary">
          <h2>Analysis Complete</h2>
          <div className="results-stats">
            <span className="badge badge-teal">{completedPlugins.length} completed</span>
            {skippedPlugins.length > 0 && (
              <span className="badge badge-red">{skippedPlugins.length} skipped</span>
            )}
            <span className="badge badge-purple">{Math.round(durationMs)}ms</span>
            <span className="badge badge-amber">
              {stepResults.reduce((s, r) => s + r.findings.length, 0)} findings
            </span>
          </div>
        </div>
      </div>

      <div className="results-steps">
        {stepResults.map((result, i) => {
          const plugin = AnalysisRegistry.get(result.pluginId)
          return (
            <StepCard
              key={result.pluginId + '_' + i}
              result={result}
              pluginTitle={plugin?.title ?? result.pluginId}
              pluginDesc={plugin?.desc ?? ''}
              stepNumber={i + 1}
            />
          )
        })}
      </div>
    </div>
  )
}
