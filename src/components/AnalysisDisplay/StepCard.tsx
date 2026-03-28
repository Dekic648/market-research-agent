/**
 * StepCard — renders one analysis step's output.
 *
 * Hierarchy:
 *   StepHeader → PlainLanguageCard → MetricsRow → Findings → DataTable
 */

import { useState } from 'react'
import { PlainLanguageCard } from './PlainLanguageCard'
import { MetricsRow } from './MetricsRow'
import { FindingCard } from './FindingCard'
import { ChartContainer } from '../Charts/ChartContainer'
import type { PluginStepResult } from '../../plugins/types'
import './AnalysisDisplay.css'

interface StepCardProps {
  result: PluginStepResult
  pluginTitle: string
  pluginDesc: string
  stepNumber: number
}

export function StepCard({ result, pluginTitle, pluginDesc, stepNumber }: StepCardProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Build metrics from result data
  const metrics = buildMetrics(result)

  return (
    <div className="step-card card">
      <div className="step-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="step-number">{stepNumber}</div>
        <div className="step-info">
          <h3>{pluginTitle}</h3>
          <span className="step-desc">{pluginDesc}</span>
        </div>
        <div className="step-toggle">{collapsed ? '▸' : '▾'}</div>
      </div>

      {!collapsed && (
        <div className="step-body">
          <PlainLanguageCard text={result.plainLanguage} />

          {/* Charts first — primary visual output */}
          {result.charts.length > 0 && (
            <div className="step-charts">
              {result.charts.map((chart) => (
                <ChartContainer key={chart.id} chart={chart} />
              ))}
            </div>
          )}

          {metrics.length > 0 && <MetricsRow metrics={metrics} />}

          {/* Findings — text accompanies charts */}
          {result.findings.length > 0 && (
            <div className="step-findings">
              {result.findings.map((f, i) => (
                <FindingCard
                  key={i}
                  title={f.title}
                  summary={f.summary}
                  significant={f.significant}
                  pValue={f.pValue}
                  effectSize={f.effectSize}
                  effectLabel={f.effectLabel}
                  flags={(f as any).flags}
                  verificationResults={(f as any).verificationResults}
                />
              ))}
            </div>
          )}

          {/* Assumptions — collapsed at bottom */}
          {result.assumptions.filter((a) => !a.passed).length > 0 && (
            <details className="assumption-details">
              <summary className="assumption-summary">
                {result.assumptions.filter((a) => !a.passed).length} assumption warning(s)
              </summary>
              <div className="assumption-warnings">
                {result.assumptions
                  .filter((a) => !a.passed)
                  .map((a, i) => (
                    <div key={i} className={`assumption-warn assumption-${a.severity}`}>
                      {String(a.message ?? '')}
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function buildMetrics(result: PluginStepResult) {
  const data = result.data as Record<string, unknown>
  const metrics: Array<{ label: string; value: string | number; highlight?: boolean }> = []

  try {
    if (data.frequencies) {
      const freqs = data.frequencies as any[]
      if (freqs.length > 0) {
        metrics.push({ label: 'Items', value: freqs.length })
        if (typeof freqs[0].mean === 'number' && !isNaN(freqs[0].mean)) {
          metrics.push({ label: 'Mean', value: freqs[0].mean })
        }
        if (typeof freqs[0].netScore === 'number' && !isNaN(freqs[0].netScore)) {
          metrics.push({ label: 'Net Score', value: `${freqs[0].netScore > 0 ? '+' : ''}${freqs[0].netScore.toFixed(1)}pp`, highlight: freqs[0].netScore > 0 })
        }
      }
    }

    if (data.results && Array.isArray(data.results)) {
      const results = data.results as any[]
      const sigCount = results.filter((r) => typeof r.p === 'number' && r.p < 0.05).length
      if (sigCount > 0) metrics.push({ label: 'Significant', value: `${sigCount}/${results.length}`, highlight: true })
    }

    if (data.result) {
      const r = data.result as any
      if (typeof r.alpha === 'number') metrics.push({ label: 'Alpha', value: r.alpha, highlight: r.alpha >= 0.7 })
      if (typeof r.R2 === 'number') metrics.push({ label: 'R²', value: r.R2, highlight: r.R2 > 0.3 })
      if (typeof r.nFactors === 'number') metrics.push({ label: 'Factors', value: r.nFactors })
    }
  } catch {
    // If metric extraction fails, return empty — never crash the render
  }

  return metrics
}
