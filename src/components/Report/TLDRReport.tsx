/**
 * TLDRReport — executive summary assembled from summaryLanguage.
 *
 * Assembly rules:
 *   1. Filter: significant OR large effect (effectSize > threshold)
 *   2. Sort by effect size DESC within method section
 *   3. Group by METHOD_GROUPS section order
 *   4. Render: summaryLanguage + key metric pill + mini-chart
 *   5. Cross-type badge on survey × behavioral findings
 *   6. Caveats section for verification warnings
 *   7. Final line: non-significant count
 */

import { useMemo, useCallback } from 'react'
import { useFindingsStore } from '../../stores/findingsStore'
import { useChartStore } from '../../stores/chartStore'
import { ChartContainer } from '../Charts/ChartContainer'
import { METHOD_GROUPS, SECTION_BY_KEY } from '../../results/methodGroups'
import type { Finding, ChartConfig } from '../../types/dataTypes'
import './TLDRReport.css'

interface TLDRSection {
  sectionKey: string
  label: string
  order: number
  findings: Finding[]
}

/** Effect size thresholds — findings above these are included even if not significant */
const EFFECT_THRESHOLDS: Record<string, number> = {
  frequency: 0,        // always included
  descriptives: 0,
  descriptives_summary: 0,
  correlation: 0.3,     // r > 0.3
  regression: 0.1,      // R² > 0.1
  driver_analysis: 0.1,
  logistic_regression: 0.6, // AUC > 0.6
  kw_significance: 0.06,   // ε² > 0.06
  anova_oneway: 0.06,
  cronbach: 0,          // always show reliability
  efa: 0,
  segment_profile: 0,   // always show profiles
}

function shouldIncludeInTLDR(f: Finding): boolean {
  if (f.suppressed) return false
  // Always include distributions
  const section = METHOD_GROUPS[f.stepId]
  if (section === 'distributions') return true
  if (section === 'reliability') return true
  // Significant findings always included
  if (f.significant) return true
  // Large effect even if not significant
  const threshold = EFFECT_THRESHOLDS[f.stepId] ?? 0.1
  if (f.effectSize !== null && Math.abs(f.effectSize) >= threshold) return true
  return false
}

function getKeyMetric(f: Finding): { label: string; value: string } | null {
  if (f.stepId === 'frequency' || f.stepId === 'descriptives_summary') {
    // Try to extract Top Box from summary
    const match = f.summary.match(/(\d+)%/)
    if (match) return { label: 'Top Box', value: `${match[1]}%` }
  }
  if (f.effectSize !== null) {
    if (f.stepId === 'correlation' || f.stepId === 'point_biserial') {
      return { label: 'r', value: f.effectSize.toFixed(2) }
    }
    if (f.stepId === 'regression' || f.stepId === 'driver_analysis') {
      return { label: 'R²', value: f.effectSize.toFixed(2) }
    }
    if (f.stepId === 'logistic_regression') {
      return { label: 'AUC', value: f.effectSize.toFixed(2) }
    }
    if (f.stepId === 'kw_significance' || f.stepId === 'anova_oneway') {
      return { label: 'Effect', value: f.effectLabel ?? f.effectSize.toFixed(3) }
    }
  }
  if (f.pValue !== null && f.significant) {
    return { label: 'p', value: f.pValue < 0.001 ? '< .001' : f.pValue.toFixed(3) }
  }
  return null
}

function assembleTLDR(findings: Finding[]): TLDRSection[] {
  let eligible = findings.filter(shouldIncludeInTLDR)

  // Redundancy suppression pass: within each primary sourceColumn group,
  // if 3+ findings share the same column and effect direction, keep only
  // the one with the highest narrativeWeight.
  const byColumn = new Map<string, Finding[]>()
  for (const f of eligible) {
    const primary = f.sourceColumns?.[0]
    if (!primary) continue
    if (!byColumn.has(primary)) byColumn.set(primary, [])
    byColumn.get(primary)!.push(f)
  }

  const suppressedIds = new Set<string>()
  for (const [, group] of byColumn) {
    if (group.length < 3) continue

    // Split by direction (positive / negative / null effect)
    const positive = group.filter((f) => (f.effectSize ?? 0) > 0)
    const negative = group.filter((f) => (f.effectSize ?? 0) < 0)

    for (const dirGroup of [positive, negative]) {
      if (dirGroup.length < 3) continue
      // Sort by narrativeWeight DESC
      dirGroup.sort((a, b) => (b.narrativeWeight ?? 0) - (a.narrativeWeight ?? 0))
      const keeper = dirGroup[0]
      for (let i = 1; i < dirGroup.length; i++) {
        dirGroup[i].suppressionReason = `Redundant — subsumed by ${keeper.id}`
        dirGroup[i].suppressed = true
        suppressedIds.add(dirGroup[i].id)
      }
    }
  }

  // Re-filter after suppression
  if (suppressedIds.size > 0) {
    eligible = eligible.filter((f) => !suppressedIds.has(f.id))
  }

  // Group by method section
  const sectionMap = new Map<string, Finding[]>()
  for (const f of eligible) {
    const key = METHOD_GROUPS[f.stepId] ?? 'other'
    if (!sectionMap.has(key)) sectionMap.set(key, [])
    sectionMap.get(key)!.push(f)
  }

  // Sort within each section by narrativeWeight DESC, falling back to effectSize
  for (const [, sectionFindings] of sectionMap) {
    sectionFindings.sort((a, b) => {
      const wA = a.narrativeWeight ?? Math.abs(a.effectSize ?? 0)
      const wB = b.narrativeWeight ?? Math.abs(b.effectSize ?? 0)
      return wB - wA
    })
  }

  // Build sections in order
  const sections: TLDRSection[] = []
  const sectionOrder = ['distributions', 'group_comparisons', 'correlations', 'drivers', 'factor', 'temporal', 'advanced', 'other']
  for (const key of sectionOrder) {
    const sfs = sectionMap.get(key)
    if (!sfs || sfs.length === 0) continue
    const def = SECTION_BY_KEY[key]
    sections.push({
      sectionKey: key,
      label: def?.label ?? key,
      order: def?.order ?? 99,
      findings: sfs,
    })
  }

  return sections
}

function copyFindingText(f: Finding): string {
  const metric = getKeyMetric(f)
  return `${f.title}\n${f.summaryLanguage}${metric ? `\n${metric.label}: ${metric.value}` : ''}`
}

export function TLDRReport() {
  const findings = useFindingsStore((s) => s.findings)
  const chartConfigs = useChartStore((s) => s.configs)
  const charts = Object.values(chartConfigs)

  const sections = useMemo(() => assembleTLDR(findings), [findings])
  const totalFindings = findings.filter((f) => !f.suppressed).length
  const tldrCount = sections.reduce((s, sec) => s + sec.findings.length, 0)
  const nonSigCount = findings.filter((f) => !f.suppressed && !f.significant).length

  // Caveats from verification results
  const caveats = useMemo(() => {
    const all: string[] = []
    for (const f of findings) {
      if (!f.verificationResults) continue
      for (const vr of f.verificationResults) {
        if (vr.severity === 'warning') {
          all.push(`${f.title}: ${vr.message}`)
        }
      }
    }
    return all
  }, [findings])

  const handleCopyAll = useCallback(() => {
    const lines = sections.flatMap((sec) =>
      sec.findings.map(copyFindingText)
    ).join('\n\n')
    navigator.clipboard?.writeText(lines)
  }, [sections])

  const handleCopyOne = useCallback((f: Finding) => {
    navigator.clipboard?.writeText(copyFindingText(f))
  }, [])

  // Find chart for a finding by stepId
  const findChart = useCallback((f: Finding): ChartConfig | undefined => {
    return charts.find((c: ChartConfig) => c.stepId === f.stepId)
  }, [charts])

  if (totalFindings === 0) {
    return (
      <div className="tldr-report">
        <div className="tldr-empty card">
          <p>No findings to report. Run an analysis first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tldr-report">
      {/* Header with Copy All */}
      <div className="tldr-header">
        <h2>Executive Summary</h2>
        <button className="tldr-copy-all" onClick={handleCopyAll}>
          Copy all
        </button>
      </div>

      {/* Numbered findings list */}
      <ol className="tldr-findings-list">
        {sections.flatMap((section) => section.findings).map((f, idx) => {
          const metric = getKeyMetric(f)
          const chart = findChart(f)
          return (
            <li key={f.id} className="tldr-finding">
              <div className="tldr-finding-header">
                <span className="tldr-finding-number">{idx + 1}</span>
                <div className="tldr-finding-text">
                  <p className="tldr-summary">{f.summaryLanguage}</p>
                  <div className="tldr-finding-meta">
                    {metric && (
                      <span className="tldr-metric-pill">
                        {metric.label}: {metric.value}
                      </span>
                    )}
                    {f.crossType && (
                      <span className="tldr-cross-badge">Survey × Behavioral</span>
                    )}
                  </div>
                </div>
                <button className="tldr-copy-btn" onClick={() => handleCopyOne(f)} title="Copy">
                  &#128203;
                </button>
              </div>
              {/* Mini chart */}
              {chart && (
                <div className="tldr-mini-chart">
                  <ChartContainer chart={{
                    ...chart,
                    layout: { ...chart.layout, title: undefined, showlegend: false,
                      xaxis: { ...(chart.layout.xaxis as any ?? {}), title: undefined, showticklabels: false },
                      yaxis: { ...(chart.layout.yaxis as any ?? {}), title: undefined },
                      margin: { l: 40, r: 10, t: 10, b: 20 },
                    },
                  }} height={160} />
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {/* Caveats */}
      {caveats.length > 0 && (
        <div className="tldr-caveats card">
          <h3 className="tldr-caveats-title">Caveats</h3>
          <p className="tldr-caveats-text">
            {caveats.join(' ')}
          </p>
        </div>
      )}

      {/* Non-significant count */}
      <div className="tldr-nonsig">
        {nonSigCount} of {totalFindings} analyses returned non-significant results — available in full results.
      </div>
    </div>
  )
}

export { assembleTLDR, shouldIncludeInTLDR, getKeyMetric }
