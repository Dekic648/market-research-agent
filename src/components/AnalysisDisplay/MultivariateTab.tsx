/**
 * MultivariateTab — Tab V: regression, drivers, EFA, reliability.
 *
 * Renders existing MethodSection/ResultQuestionBlock components
 * for multivariate stepIds. Straight move from previous implementation.
 */

import { useMemo, useState } from 'react'
import { MethodSection } from './MethodSection'
import { groupFindings } from '../../results/groupFindings'
import type { Finding } from '../../types/dataTypes'
import type { PluginStepResult } from '../../plugins/types'

const MULTIVARIATE_STEP_IDS = new Set([
  'regression', 'driver_analysis', 'logistic_regression',
  'ordinal_regression', 'efa', 'cronbach',
])

/** Section keys that belong to the multivariate tab */
const MULTIVARIATE_SECTIONS = new Set(['drivers', 'factor', 'reliability'])

interface MultivariateTabProps {
  findings: Finding[]
  taskStepResults: Record<string, PluginStepResult>
}

export function MultivariateTab({ findings, taskStepResults }: MultivariateTabProps) {
  const [forceState, setForceState] = useState<{ collapsed: boolean; key: number } | undefined>(undefined)

  const sections = useMemo(() => {
    // Filter findings to only multivariate stepIds
    const mvFindings = findings.filter((f) => MULTIVARIATE_STEP_IDS.has(f.stepId))
    if (mvFindings.length === 0) return []

    // Filter taskStepResults to only multivariate plugins
    const mvTaskStepResults: Record<string, PluginStepResult> = {}
    for (const [key, sr] of Object.entries(taskStepResults)) {
      if (MULTIVARIATE_STEP_IDS.has(sr.pluginId)) {
        mvTaskStepResults[key] = sr
      }
    }

    const allSections = groupFindings(mvFindings, mvTaskStepResults)
    return allSections.filter((s) => MULTIVARIATE_SECTIONS.has(s.key))
  }, [findings, taskStepResults])

  if (sections.length === 0) {
    return (
      <div className="results-empty-tab">
        No multivariate analyses to display.
      </div>
    )
  }

  return (
    <div className="multivariate-tab">
      {sections.map((section) => (
        <MethodSection
          key={section.key}
          section={section}
          defaultOpen={true}
          forceState={forceState}
        />
      ))}
    </div>
  )
}
