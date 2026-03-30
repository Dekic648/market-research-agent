/**
 * CrosstabsTab — Tab II: question × segment cross-tabulations.
 */

import { useMemo, useState } from 'react'
import { ChartContainer } from '../Charts/ChartContainer'
import { DataTable } from './DataTable'
import { truncateLabel } from '../../engine/chartDefaults'
import type { Finding, ChartConfig } from '../../types/dataTypes'
import type { PluginStepResult, ResultTable } from '../../plugins/types'

interface CrosstabsTabProps {
  findings: Finding[]
  taskStepResults: Record<string, PluginStepResult>
  questionOrder: string[]
}

interface CrosstabBlockData {
  label: string
  groupedBar: ChartConfig | null
  heatmap: ChartConfig | null
  table: ResultTable | null
}

/** Check if a finding's sourceQuestionLabel matches a block label */
function labelMatches(finding: Finding, blockLabel: string): boolean {
  const sql = finding.sourceQuestionLabel
  if (!sql) return false
  if (sql === blockLabel) return true
  if (sql.endsWith(': ' + blockLabel)) return true
  if (sql.includes(blockLabel)) return true
  return false
}

export function CrosstabsTab({ findings, taskStepResults, questionOrder }: CrosstabsTabProps) {
  // Check if any segment variable exists
  const hasSegment = findings.some((f) => f.stepId === 'crosstab')

  const blocks = useMemo(() => {
    if (!hasSegment) return []
    const result: CrosstabBlockData[] = []

    for (const label of questionOrder) {
      const xtabFindings = findings.filter((f) =>
        f.stepId === 'crosstab' && labelMatches(f, label) && !f.suppressed
      )
      if (xtabFindings.length === 0) continue

      let groupedBar: ChartConfig | null = null
      let heatmap: ChartConfig | null = null
      let table: ResultTable | null = null

      for (const f of xtabFindings) {
        if (f.sourceTaskId && taskStepResults[f.sourceTaskId]) {
          const sr = taskStepResults[f.sourceTaskId]
          groupedBar = sr.charts.find((c) => c.type === 'groupedBar') ?? null
          heatmap = sr.charts.find((c) => c.type === 'heatmap') ?? null
          table = sr.tables?.[0] ?? null
          break
        }
      }

      result.push({ label, groupedBar, heatmap, table })
    }

    // Fallback: if ordered matching found nothing, group by sourceQuestionLabel
    if (result.length === 0) {
      const xtabFindings = findings.filter((f) => f.stepId === 'crosstab' && !f.suppressed)
      const labelGroups = new Map<string, Finding[]>()
      for (const f of xtabFindings) {
        const key = f.sourceQuestionLabel || f.title
        if (!labelGroups.has(key)) labelGroups.set(key, [])
        labelGroups.get(key)!.push(f)
      }

      for (const [groupLabel, groupFindings] of labelGroups) {
        let groupedBar: ChartConfig | null = null
        let heatmap: ChartConfig | null = null
        let table: ResultTable | null = null

        for (const f of groupFindings) {
          if (f.sourceTaskId && taskStepResults[f.sourceTaskId]) {
            const sr = taskStepResults[f.sourceTaskId]
            groupedBar = sr.charts.find((c) => c.type === 'groupedBar') ?? null
            heatmap = sr.charts.find((c) => c.type === 'heatmap') ?? null
            table = sr.tables?.[0] ?? null
            break
          }
        }
        result.push({ label: groupLabel, groupedBar, heatmap, table })
      }
    }

    return result
  }, [findings, taskStepResults, questionOrder, hasSegment])

  if (!hasSegment) {
    return (
      <div className="results-empty-tab">
        No segment variable detected. Cross-tabulations require a segment column.
      </div>
    )
  }

  if (blocks.length === 0) {
    return <div className="results-empty-tab">No cross-tabulation results to display.</div>
  }

  return (
    <div className="crosstabs-tab">
      {blocks.map((block) => (
        <CrosstabBlock key={block.label} block={block} />
      ))}
    </div>
  )
}

function CrosstabBlock({ block }: { block: CrosstabBlockData }) {
  const [tableOpen, setTableOpen] = useState(false)
  const displayLabel = truncateLabel(block.label, 60)

  return (
    <div className="result-question-block">
      <div className="rqb-header">
        <h4 className="rqb-title" title={block.label}>{displayLabel}</h4>
      </div>

      <div className="rqb-body">
        {block.groupedBar && (
          <div className="rqb-charts">
            <ChartContainer chart={block.groupedBar} />
          </div>
        )}

        {block.heatmap && (
          <div className="rqb-charts">
            <ChartContainer chart={block.heatmap} />
          </div>
        )}

        {block.table && (
          <div className="rqb-tables-section">
            <button className="rqb-stats-toggle" onClick={() => setTableOpen(!tableOpen)}>
              {tableOpen ? '− % table' : '+ Show % table'}
            </button>
            {tableOpen && (
              <div className="rqb-tables">
                <div className="rqb-table-block">
                  <h5 className="rqb-table-title">{block.table.title}</h5>
                  <DataTable columns={block.table.columns} rows={block.table.rows} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
