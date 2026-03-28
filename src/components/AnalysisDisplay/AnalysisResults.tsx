/**
 * AnalysisResults — renders findings grouped by analysis method.
 *
 * Layout:
 *   ResultsPageHeader (stats + collapse/expand toggle)
 *   FlagsStrip (verification warnings, dismissible)
 *   MethodSection x N (each containing QuestionBlocks)
 */

import { useMemo, useState } from 'react'
import { ResultsPageHeader } from './ResultsPageHeader'
import { FlagsStrip } from './FlagsStrip'
import { MethodSection } from './MethodSection'
import { groupFindings } from '../../results/groupFindings'
import type { RunResult } from '../../runners/IStepRunner'
import type { PluginStepResult } from '../../plugins/types'
import './AnalysisDisplay.css'

interface AnalysisResultsProps {
  runResult: RunResult
  taskStepResults?: Record<string, PluginStepResult>
}

export function AnalysisResults({ runResult, taskStepResults }: AnalysisResultsProps) {
  const { findings, completedPlugins, durationMs } = runResult
  const [forceState, setForceState] = useState<{ collapsed: boolean; key: number } | undefined>(undefined)
  const [allCollapsed, setAllCollapsed] = useState(false)

  const methodSections = useMemo(
    () => groupFindings(findings, taskStepResults),
    [findings, taskStepResults]
  )

  const totalFindings = findings.filter((f) => !f.suppressed).length

  const handleToggleAll = () => {
    const next = !allCollapsed
    setAllCollapsed(next)
    setForceState({ collapsed: next, key: Date.now() })
  }

  return (
    <div className="analysis-results">
      <ResultsPageHeader
        totalFindings={totalFindings}
        completedPlugins={completedPlugins.length}
        durationMs={durationMs}
        allCollapsed={allCollapsed}
        onToggleAll={handleToggleAll}
      />

      <FlagsStrip findings={findings} />

      <div className="method-sections">
        {methodSections.map((section) => (
          <MethodSection
            key={section.key}
            section={section}
            defaultOpen={true}
            forceState={forceState}
          />
        ))}
      </div>
    </div>
  )
}
