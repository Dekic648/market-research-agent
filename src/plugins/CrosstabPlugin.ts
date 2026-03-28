/**
 * CrosstabPlugin — cross-tabulation by segment.
 *
 * Produces: count table, row/column %, index values.
 * Charts: heatmap, groupedBar.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import type {
  AnalysisPlugin,
  PluginStepResult,
  ResolvedColumnData,
  OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface CrosstabCell {
  count: number
  rowPct: number
  colPct: number
  index: number    // (colPct / overall pct) * 100 — 100 = average
}

interface CrosstabResult {
  columnId: string
  columnName: string
  segmentName: string
  rowLabels: (string | number)[]
  colLabels: (string | number)[]
  table: CrosstabCell[][]
  rowTotals: number[]
  colTotals: number[]
  grandTotal: number
}

function computeCrosstab(
  colValues: (number | string | null)[],
  segValues: (number | string | null)[],
  colName: string,
  colId: string,
  segName: string
): CrosstabResult {
  // Collect unique labels
  const rowSet = new Set<string | number>()
  const colSet = new Set<string | number>()
  const n = Math.min(colValues.length, segValues.length)

  for (let i = 0; i < n; i++) {
    if (colValues[i] !== null) rowSet.add(colValues[i] as string | number)
    if (segValues[i] !== null) colSet.add(segValues[i] as string | number)
  }

  const rowLabels = Array.from(rowSet).sort((a, b) => {
    const na = Number(a), nb = Number(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return String(a).localeCompare(String(b))
  })
  const colLabels = Array.from(colSet).sort((a, b) => {
    const na = Number(a), nb = Number(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return String(a).localeCompare(String(b))
  })

  // Count table
  const counts: number[][] = rowLabels.map(() => colLabels.map(() => 0))
  let grandTotal = 0

  for (let i = 0; i < n; i++) {
    if (colValues[i] === null || segValues[i] === null) continue
    const ri = rowLabels.indexOf(colValues[i] as string | number)
    const ci = colLabels.indexOf(segValues[i] as string | number)
    if (ri >= 0 && ci >= 0) {
      counts[ri][ci]++
      grandTotal++
    }
  }

  const rowTotals: number[] = rowLabels.map((_, ri) => counts[ri].reduce((s: number, c: number) => s + c, 0))
  const colTotals: number[] = colLabels.map((_, ci) => {
    let t = 0
    for (let ri = 0; ri < rowLabels.length; ri++) t += counts[ri][ci]
    return t
  })

  const table: CrosstabCell[][] = rowLabels.map((_, ri) =>
    colLabels.map((_, ci) => {
      const count = counts[ri][ci]
      const rowPct = rowTotals[ri] > 0 ? (count / rowTotals[ri]) * 100 : 0
      const colPct = colTotals[ci] > 0 ? (count / colTotals[ci]) * 100 : 0
      const overallPct = grandTotal > 0 ? (rowTotals[ri] / grandTotal) * 100 : 0
      const index = overallPct > 0 ? (colPct / overallPct) * 100 : 100
      return { count, rowPct, colPct, index }
    })
  )

  return { columnId: colId, columnName: colName, segmentName: segName, rowLabels, colLabels, table, rowTotals, colTotals, grandTotal }
}

function buildHeatmapChart(ct: CrosstabResult): ChartConfig {
  const z = ct.table.map((row) => row.map((cell) => cell.colPct))
  const text = ct.table.map((row) => row.map((cell) =>
    `${cell.colPct.toFixed(1)}% (n=${cell.count}, idx=${cell.index.toFixed(0)})`
  ))

  return {
    id: `crosstab_heatmap_${ct.columnId}_${Date.now()}`,
    type: 'heatmap',
    data: [{
      z,
      x: ct.colLabels.map(String),
      y: ct.rowLabels.map(String),
      type: 'heatmap',
      colorscale: 'Blues',
      text,
      hoverinfo: 'text',
    }],
    layout: {
      ...baseLayout,
      title: { text: `${ct.columnName} × ${ct.segmentName}` },
      xaxis: { title: { text: ct.segmentName } },
      yaxis: { title: { text: ct.columnName }, automargin: true },
    },
    config: baseConfig,
    stepId: 'crosstab',
    edits: {},
  }
}

function buildGroupedBarChart(ct: CrosstabResult): ChartConfig {
  const traces = ct.colLabels.map((seg, ci) => ({
    name: String(seg),
    type: 'bar',
    x: ct.rowLabels.map(String),
    y: ct.table.map((row) => row[ci].colPct),
    marker: { color: brandColors[ci % brandColors.length] },
  }))

  return {
    id: `crosstab_grouped_${ct.columnId}_${Date.now()}`,
    type: 'groupedBar',
    data: traces,
    layout: {
      ...baseLayout,
      barmode: 'group',
      title: { text: `${ct.columnName} by ${ct.segmentName}` },
      yaxis: { title: { text: '% within segment' } },
    },
    config: baseConfig,
    stepId: 'crosstab',
    edits: {},
  }
}

const CrosstabPlugin: AnalysisPlugin = {
  id: 'crosstab',
  title: 'Cross-tabulation',
  desc: 'Percentage breakdown by segment with index values.',
  priority: 20,
  reportPriority: 2,

  requires: ['ordinal', 'segment'],
  preconditions: [],

  produces: {
    description: 'Cross-tabulation table with counts, row%, col%, and index values',
    fields: { crosstabs: 'CrosstabResult[]' },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (!data.segment) throw new Error('CrosstabPlugin requires a segment column')

    const crosstabs = data.columns.map((col) =>
      computeCrosstab(col.values, data.segment!.values, col.name, col.id, data.segment!.name)
    )

    const charts: ChartConfig[] = []
    for (const ct of crosstabs) {
      charts.push(buildHeatmapChart(ct))
      charts.push(buildGroupedBarChart(ct))
    }

    const findings = crosstabs.map((ct) => {
      const highIndex = ct.table.flatMap((row, ri) =>
        row.filter((c) => c.index > 130).map((c, ci) => ({
          row: ct.rowLabels[ri],
          col: ct.colLabels[ci],
          index: c.index,
        }))
      )
      return {
        type: 'crosstab',
        title: `${ct.columnName} × ${ct.segmentName}`,
        summary: highIndex.length > 0
          ? `${highIndex.length} cell(s) over-indexed (>130). Strongest: "${highIndex[0]?.row}" in "${highIndex[0]?.col}" (index ${highIndex[0]?.index.toFixed(0)}).`
          : `No strong over-indexing detected across ${ct.colLabels.length} segments.`,
        detail: JSON.stringify({ grandTotal: ct.grandTotal, nRows: ct.rowLabels.length, nCols: ct.colLabels.length }),
        significant: false,
        pValue: null,
        effectSize: null,
        effectLabel: null,
        theme: null,
      }
    })

    return {
      pluginId: 'crosstab',
      data: { crosstabs },
      charts,
      findings,
      plainLanguage: this.plainLanguage({ pluginId: 'crosstab', data: { crosstabs }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'crosstab', nColumns: crosstabs.length } },
    }
  },

  plainLanguage(result: PluginStepResult): string {
    const cts = (result.data as { crosstabs: CrosstabResult[] }).crosstabs
    if (!cts || cts.length === 0) return 'No crosstab data.'
    // Find the most over-indexed cell across all crosstabs
    let bestCell: { colName: string; row: string | number; col: string | number; index: number } | null = null
    for (const ct of cts) {
      for (let ri = 0; ri < ct.rowLabels.length; ri++) {
        for (let ci = 0; ci < ct.colLabels.length; ci++) {
          const idx = ct.table[ri][ci].index
          if (!bestCell || idx > bestCell.index) {
            bestCell = { colName: ct.columnName, row: ct.rowLabels[ri], col: ct.colLabels[ci], index: idx }
          }
        }
      }
    }
    if (bestCell && bestCell.index > 130) {
      return `"${bestCell.row}" on ${bestCell.colName} is over-represented in the "${bestCell.col}" segment (index ${bestCell.index.toFixed(0)} vs 100 average). ${cts.length} variable(s) cross-tabulated by ${cts[0].segmentName}.`
    }
    return `Response patterns are relatively even across ${cts[0].segmentName} groups. ${cts.length} variable(s) cross-tabulated (N = ${cts[0].grandTotal}).`
  },
}

AnalysisRegistry.register(CrosstabPlugin)
export { CrosstabPlugin }
