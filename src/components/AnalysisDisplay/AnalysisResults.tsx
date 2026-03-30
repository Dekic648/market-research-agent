/**
 * AnalysisResults — 5-tab layout for analysis findings.
 *
 * Tabs:
 *   I.   Distributions — base frequencies in paste order
 *   II.  Cross-tabulations — question × segment heatmaps and grouped bars
 *   III. Significance — KW / ANOVA verdicts per question
 *   IV.  Correlations — correlation matrix and pair list
 *   V.   Multivariate — regression, drivers, EFA, reliability
 */

import { useState } from 'react'
import { ResultsPageHeader } from './ResultsPageHeader'
import { FlagsStrip } from './FlagsStrip'
import { DistributionsTab } from './DistributionsTab'
import { CrosstabsTab } from './CrosstabsTab'
import { SignificanceTab } from './SignificanceTab'
import { CorrelationsTab } from './CorrelationsTab'
import { MultivariateTab } from './MultivariateTab'
import type { RunResult } from '../../runners/IStepRunner'
import type { PluginStepResult } from '../../plugins/types'
import './AnalysisDisplay.css'

type AnalysisTab = 'distributions' | 'crosstabs' | 'significance' | 'correlations' | 'multivariate'

const TAB_LABELS: Record<AnalysisTab, string> = {
  distributions: 'I. Distributions',
  crosstabs: 'II. Cross-tabulations',
  significance: 'III. Significance',
  correlations: 'IV. Correlations',
  multivariate: 'V. Multivariate',
}

const TAB_ORDER: AnalysisTab[] = ['distributions', 'crosstabs', 'significance', 'correlations', 'multivariate']

interface AnalysisResultsProps {
  runResult: RunResult
  taskStepResults?: Record<string, PluginStepResult>
}

export function AnalysisResults({ runResult, taskStepResults }: AnalysisResultsProps) {
  const { findings, completedPlugins, durationMs } = runResult
  const [activeTab, setActiveTab] = useState<AnalysisTab>('distributions')
  const [showNonSig, setShowNonSig] = useState(false)

  const totalFindings = findings.filter((f) => !f.suppressed).length
  const questionOrder = runResult.questionOrder ?? []

  // Count non-significant findings for the toggle label
  const nonSigCount = findings.filter((f) => !f.suppressed && !f.significant && f.pValue !== null).length

  return (
    <div className="analysis-results">
      <ResultsPageHeader
        totalFindings={totalFindings}
        completedPlugins={completedPlugins.length}
        durationMs={durationMs}
        allCollapsed={false}
        onToggleAll={() => {}}
      />

      <FlagsStrip findings={findings} />

      {/* 5-tab bar */}
      <div className="results-tab-bar">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'report-tab-active' : 'report-tab'}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Non-significant toggle */}
      <div className="results-ns-toggle">
        <label>
          <input
            type="checkbox"
            checked={showNonSig}
            onChange={() => setShowNonSig(!showNonSig)}
          />
          {' '}Show non-significant findings
          {nonSigCount > 0 && !showNonSig && (
            <span className="results-ns-count"> ({nonSigCount} hidden)</span>
          )}
        </label>
      </div>

      {/* Tab panels */}
      <div className="analysis-tab-panel">
        {activeTab === 'distributions' && (
          <DistributionsTab
            findings={findings}
            taskStepResults={taskStepResults ?? {}}
            questionOrder={questionOrder}
          />
        )}
        {activeTab === 'crosstabs' && (
          <CrosstabsTab
            findings={findings}
            taskStepResults={taskStepResults ?? {}}
            questionOrder={questionOrder}
          />
        )}
        {activeTab === 'significance' && (
          <SignificanceTab
            findings={findings}
            taskStepResults={taskStepResults ?? {}}
            questionOrder={questionOrder}
            showNonSig={showNonSig}
          />
        )}
        {activeTab === 'correlations' && (
          <CorrelationsTab
            findings={findings}
            showNonSig={showNonSig}
          />
        )}
        {activeTab === 'multivariate' && (
          <MultivariateTab
            findings={findings}
            taskStepResults={taskStepResults ?? {}}
          />
        )}
      </div>
    </div>
  )
}
