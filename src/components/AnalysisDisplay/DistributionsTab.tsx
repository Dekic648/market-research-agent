/**
 * DistributionsTab — Tab I: base frequency/distribution charts per question in paste order.
 */

import { useMemo, useState } from 'react'
import { ChartContainer } from '../Charts/ChartContainer'
import { PlainLanguageCard } from './PlainLanguageCard'
import { DataTable } from './DataTable'
import { truncateLabel } from '../../engine/chartDefaults'
import type { Finding } from '../../types/dataTypes'
import type { PluginStepResult, ResultTable } from '../../plugins/types'

interface DistributionsTabProps {
  findings: Finding[]
  taskStepResults: Record<string, PluginStepResult>
  questionOrder: string[]
}

/** Extract mean, n, and topBox from a frequency finding's detail or summary */
function extractStats(finding: Finding): { mean: number | null; n: number | null; topBox: number | null; isLikert: boolean } {
  try {
    const detail = JSON.parse(finding.detail)
    if (typeof detail === 'object' && detail !== null && !Array.isArray(detail)) {
      const topBox = typeof detail.topBox === 'number' ? detail.topBox : null
      // Likert heuristic: topBox > 0 means scale with top/bottom box (ordinal, not categorical)
      const isLikert = topBox !== null && topBox > 0
      return {
        mean: typeof detail.mean === 'number' ? detail.mean : null,
        n: typeof detail.n === 'number' ? detail.n : null,
        topBox,
        isLikert,
      }
    }
  } catch { /* not JSON */ }
  // Fall back to parsing the summary
  const meanMatch = finding.summary.match(/Mean\s*=\s*([\d.]+)/)
  const nMatch = finding.summary.match(/n\s*=\s*(\d+)/)
  return {
    mean: meanMatch ? parseFloat(meanMatch[1]) : null,
    n: nMatch ? parseInt(nMatch[1], 10) : null,
    topBox: null,
    isLikert: false,
  }
}

interface QuestionBlockData {
  label: string
  charts: import('../../types/dataTypes').ChartConfig[]
  tables: ResultTable[]
  summaryText: string
  mean: number | null
  n: number | null
  topBox: number | null
  isLikert: boolean
  nFindings: number
}

/** Check if a finding's sourceQuestionLabel matches a block label */
function labelMatches(finding: Finding, blockLabel: string): boolean {
  const sql = finding.sourceQuestionLabel
  if (!sql) return false
  if (sql === blockLabel) return true
  if (sql.startsWith(blockLabel)) return true
  return false
}

export function DistributionsTab({ findings, taskStepResults, questionOrder }: DistributionsTabProps) {
  const blocks = useMemo(() => {
    const result: QuestionBlockData[] = []

    for (const label of questionOrder) {
      // Match by finding's sourceQuestionLabel (handles plugin prefix)
      const freqFindings = findings.filter((f) =>
        f.stepId === 'frequency' && labelMatches(f, label) && !f.suppressed
      )
      if (freqFindings.length === 0) continue

      // Collect charts and tables from ALL matching taskStepResults
      const charts: import('../../types/dataTypes').ChartConfig[] = []
      const tables: ResultTable[] = []
      let summaryText = ''
      const seenTaskIds = new Set<string>()

      for (const f of freqFindings) {
        if (f.sourceTaskId && taskStepResults[f.sourceTaskId] && !seenTaskIds.has(f.sourceTaskId)) {
          seenTaskIds.add(f.sourceTaskId)
          const sr = taskStepResults[f.sourceTaskId]
          charts.push(...sr.charts)
          if (sr.tables) tables.push(...sr.tables)
          if (!summaryText) {
            summaryText = sr.interpretationCard || f.summaryLanguage || sr.plainLanguage || ''
          }
        }
      }

      // Fall back to summaryLanguage if no interpretation card
      if (!summaryText && freqFindings[0]) {
        summaryText = freqFindings[0].summaryLanguage || ''
      }

      const stats = freqFindings[0] ? extractStats(freqFindings[0]) : { mean: null, n: null, topBox: null, isLikert: false }

      result.push({ label, charts, tables, summaryText, ...stats, nFindings: freqFindings.length })
    }

    // Fallback: if ordered matching found nothing, group all frequency findings by sourceQuestionLabel
    if (result.length === 0) {
      const freqFindings = findings.filter((f) => f.stepId === 'frequency' && !f.suppressed)
      const labelGroups = new Map<string, Finding[]>()
      for (const f of freqFindings) {
        const key = f.sourceQuestionLabel || f.title
        if (!labelGroups.has(key)) labelGroups.set(key, [])
        labelGroups.get(key)!.push(f)
      }

      for (const [groupLabel, groupFindings] of labelGroups) {
        const charts: import('../../types/dataTypes').ChartConfig[] = []
        const tables: ResultTable[] = []
        let summaryText = ''
        const seenIds = new Set<string>()

        for (const f of groupFindings) {
          if (f.sourceTaskId && taskStepResults[f.sourceTaskId] && !seenIds.has(f.sourceTaskId)) {
            seenIds.add(f.sourceTaskId)
            const sr = taskStepResults[f.sourceTaskId]
            charts.push(...sr.charts)
            if (sr.tables) tables.push(...sr.tables)
            if (!summaryText) summaryText = sr.interpretationCard || f.summaryLanguage || sr.plainLanguage || ''
          }
        }
        if (!summaryText && groupFindings[0]) summaryText = groupFindings[0].summaryLanguage || ''
        const stats = groupFindings[0] ? extractStats(groupFindings[0]) : { mean: null, n: null, topBox: null, isLikert: false }
        result.push({ label: groupLabel, charts, tables, summaryText, ...stats, nFindings: groupFindings.length })
      }
    }

    return result
  }, [findings, taskStepResults, questionOrder])

  if (blocks.length === 0) {
    return <div className="results-empty-tab">No distribution analyses to display.</div>
  }

  return (
    <div className="distributions-tab">
      {blocks.map((block) => (
        <DistributionBlock key={block.label} block={block} />
      ))}
    </div>
  )
}

function DistributionBlock({ block }: { block: QuestionBlockData }) {
  const [tablesOpen, setTablesOpen] = useState(false)
  const displayLabel = truncateLabel(block.label, 60)

  // Add Top-2 Box reference line to horizontal bar charts for Likert columns
  const chartsWithAnnotation = useMemo(() => {
    if (!block.isLikert || block.topBox === null) return block.charts
    return block.charts.map((chart) => {
      if (chart.type !== 'horizontalBar') return chart
      const existingShapes = (chart.layout as any).shapes ?? []
      return {
        ...chart,
        layout: {
          ...chart.layout,
          shapes: [
            ...existingShapes,
            {
              type: 'line',
              x0: block.topBox, x1: block.topBox,
              y0: -0.5, y1: 10,
              line: { color: '#1d9e75', dash: 'dot', width: 2 },
            },
          ],
          annotations: [
            ...((chart.layout as any).annotations ?? []),
            {
              x: block.topBox, y: 1.02, xref: 'x', yref: 'paper',
              text: `Top 2 Box: ${block.topBox!.toFixed(0)}%`,
              showarrow: false,
              font: { size: 11, color: '#1d9e75', family: 'Inter, system-ui, sans-serif' },
            },
          ],
        },
      }
    })
  }, [block.charts, block.topBox, block.isLikert])

  return (
    <div className="result-question-block">
      <div className="rqb-header">
        <h4 className="rqb-title" title={block.label}>{displayLabel}</h4>
      </div>

      <div className="rqb-body">
        {/* Top-2 Box callout — single rating/ordinal-radio only, not matrix or binary */}
        {block.isLikert && block.topBox !== null && block.nFindings === 1 && (
          <div className="dist-topbox-callout">
            Top 2 Box: <strong>{block.topBox.toFixed(0)}%</strong>
          </div>
        )}

        {/* Charts */}
        {chartsWithAnnotation.length > 0 && (
          <div className="rqb-charts">
            {chartsWithAnnotation.map((chart) => (
              <ChartContainer key={chart.id} chart={chart} />
            ))}
          </div>
        )}

        {/* Secondary stats */}
        {(block.mean !== null || block.n !== null) && (
          <div className="rqb-secondary-stats">
            {block.mean !== null && <span>Mean: {block.mean.toFixed(1)}</span>}
            {block.n !== null && <span>n={block.n}</span>}
          </div>
        )}

        {/* Plain language summary */}
        {block.summaryText && (
          <div className="rqb-plain-language-muted">
            <PlainLanguageCard text={block.summaryText} />
          </div>
        )}

        {/* Tables — collapsed */}
        {block.tables.length > 0 && (
          <div className="rqb-tables-section">
            <button className="rqb-stats-toggle" onClick={() => setTablesOpen(!tablesOpen)}>
              {tablesOpen ? '− Data tables' : `+ Data tables (${block.tables.length})`}
            </button>
            {tablesOpen && (
              <div className="rqb-tables">
                {block.tables.map((table) => (
                  <div key={table.id} className="rqb-table-block">
                    <h5 className="rqb-table-title">{table.title}</h5>
                    <DataTable columns={table.columns} rows={table.rows} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
