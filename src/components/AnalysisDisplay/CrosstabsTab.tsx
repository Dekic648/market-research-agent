/**
 * CrosstabsTab — Tab II: question × segment cross-tabulations.
 * Includes col%/row% toggle per block.
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
  finding: Finding | null
}

function labelMatches(finding: Finding, blockLabel: string): boolean {
  const sql = finding.sourceQuestionLabel
  if (!sql) return false
  if (sql === blockLabel) return true
  if (sql.startsWith(blockLabel)) return true
  return false
}

/** Build a ResultTable from raw CrosstabResult using the given pct mode */
function buildTableFromDetail(detail: any, mode: 'col' | 'row'): ResultTable | null {
  const { rowLabels, colLabels, table, colTotals, rowTotals, grandTotal } = detail
  if (!rowLabels || !colLabels || !table) return null

  const columns: ResultTable['columns'] = [
    { key: 'segment', label: detail.segmentName ?? 'Segment' },
    ...rowLabels.map((rl: string | number) => ({ key: `val_${rl}`, label: String(rl), numeric: true })),
    { key: 'mean', label: 'Mean', numeric: true },
    { key: 'n', label: 'N', numeric: true },
  ]

  const rows: ResultTable['rows'] = colLabels.map((seg: string | number, ci: number) => {
    const row: Record<string, string | number | null> = { segment: String(seg) }
    let sum = 0
    let count = 0
    for (let ri = 0; ri < rowLabels.length; ri++) {
      const cell = table[ri]?.[ci]
      if (!cell) continue
      const pct = mode === 'row' ? (cell.rowPct ?? 0) : (cell.colPct ?? 0)
      row[`val_${rowLabels[ri]}`] = `${Math.round(pct)}%`
      const val = Number(rowLabels[ri])
      if (!isNaN(val)) {
        sum += val * (cell.count ?? 0)
        count += (cell.count ?? 0)
      }
    }
    row.mean = count > 0 ? Math.round((sum / count) * 100) / 100 : null
    row.n = colTotals?.[ci] ?? null
    return row
  })

  return {
    id: `xtab_${mode}_${Date.now()}`,
    title: mode === 'row' ? 'Row %' : 'Column %',
    columns,
    rows,
  }
}

export function CrosstabsTab({ findings, taskStepResults, questionOrder }: CrosstabsTabProps) {
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
      let finding: Finding | null = xtabFindings[0] ?? null

      for (const f of xtabFindings) {
        if (f.sourceTaskId && taskStepResults[f.sourceTaskId]) {
          const sr = taskStepResults[f.sourceTaskId]
          groupedBar = sr.charts.find((c) => c.type === 'groupedBar') ?? null
          heatmap = sr.charts.find((c) => c.type === 'heatmap') ?? null
          table = sr.tables?.[0] ?? null
          finding = f
          break
        }
      }

      result.push({ label, groupedBar, heatmap, table, finding })
    }

    // Fallback
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
        const finding = groupFindings[0] ?? null

        for (const f of groupFindings) {
          if (f.sourceTaskId && taskStepResults[f.sourceTaskId]) {
            const sr = taskStepResults[f.sourceTaskId]
            groupedBar = sr.charts.find((c) => c.type === 'groupedBar') ?? null
            heatmap = sr.charts.find((c) => c.type === 'heatmap') ?? null
            table = sr.tables?.[0] ?? null
            break
          }
        }
        result.push({ label: groupLabel, groupedBar, heatmap, table, finding })
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
  const [pctMode, setPctMode] = useState<'col' | 'row'>('col')
  const displayLabel = truncateLabel(block.label, 60)

  // Parse raw CrosstabResult from finding detail for row% support
  const rawDetail = useMemo(() => {
    if (!block.finding) return null
    try { return JSON.parse(block.finding.detail) } catch { return null }
  }, [block.finding])

  // Build the display table based on pctMode
  const displayTable = useMemo(() => {
    if (pctMode === 'col' && block.table) return block.table
    if (rawDetail) return buildTableFromDetail(rawDetail, pctMode)
    return block.table
  }, [pctMode, block.table, rawDetail])

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

        {displayTable && (
          <div className="rqb-tables-section">
            <button className="rqb-stats-toggle" onClick={() => setTableOpen(!tableOpen)}>
              {tableOpen ? '− % table' : '+ Show % table'}
            </button>
            {tableOpen && (
              <div className="rqb-tables">
                {/* Col% / Row% toggle */}
                <div className="xtab-pct-toggle">
                  <button
                    className={pctMode === 'col' ? 'report-tab-active' : 'report-tab'}
                    onClick={() => setPctMode('col')}
                  >
                    Column %
                  </button>
                  <button
                    className={pctMode === 'row' ? 'report-tab-active' : 'report-tab'}
                    onClick={() => setPctMode('row')}
                  >
                    Row %
                  </button>
                </div>
                <div className="xtab-pct-label">
                  {pctMode === 'col' ? '% within segment' : '% within response option'}
                </div>
                <div className="rqb-table-block">
                  <DataTable columns={displayTable.columns} rows={displayTable.rows} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
