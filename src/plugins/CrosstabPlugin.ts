/**
 * CrosstabPlugin — cross-tabulation by segment.
 *
 * Produces: count table, row/column %, index values.
 * Charts: heatmap, groupedBar.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors, truncateLabel } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin,
  PluginStepResult,
  ResolvedColumnData,
  OutputContract,
  ResultTable,
} from './types'
import type { ChartConfig, NullMeaning } from '../types/dataTypes'

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
  segName: string,
  nullMeaning: NullMeaning = 'missing',
  weights?: number[]
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
    const w = weights?.[i] ?? 1
    // For 'not_chosen': include rows where segment is present even if question is null
    if (segValues[i] === null) continue
    if (colValues[i] === null) {
      if (nullMeaning === 'not_chosen') {
        grandTotal += w
      }
      continue
    }
    const ri = rowLabels.indexOf(colValues[i] as string | number)
    const ci = colLabels.indexOf(segValues[i] as string | number)
    if (ri >= 0 && ci >= 0) {
      counts[ri][ci] += w
      grandTotal += w
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
  const xFull = ct.colLabels.map(String)
  const yFull = ct.rowLabels.map(String)
  const text = ct.table.map((row, ri) => row.map((cell, ci) =>
    `${yFull[ri]} × ${xFull[ci]}<br>${cell.colPct.toFixed(1)}% (n=${cell.count}, idx=${cell.index.toFixed(0)})`
  ))

  return {
    id: `crosstab_heatmap_${ct.columnId}_${Date.now()}`,
    type: 'heatmap',
    data: [{
      z,
      x: xFull.map((l) => truncateLabel(l, 40)),
      y: yFull.map((l) => truncateLabel(l, 40)),
      type: 'heatmap',
      colorscale: 'Blues',
      text,
      hoverinfo: 'text',
    }],
    layout: {
      ...baseLayout,
      title: { text: `${truncateLabel(ct.columnName, 40)} × ${truncateLabel(ct.segmentName, 30)}` },
      xaxis: { title: { text: truncateLabel(ct.segmentName, 40) }, automargin: true },
      yaxis: { title: { text: truncateLabel(ct.columnName, 40) }, automargin: true },
    },
    config: baseConfig,
    stepId: 'crosstab',
    edits: {},
  }
}

function buildGroupedBarChart(ct: CrosstabResult): ChartConfig {
  const xFull = ct.rowLabels.map(String)
  const traces = ct.colLabels.map((seg, ci) => ({
    name: truncateLabel(String(seg), 30),
    type: 'bar',
    x: xFull.map((l) => truncateLabel(l, 40)),
    y: ct.table.map((row) => row[ci].colPct),
    marker: { color: brandColors[ci % brandColors.length] },
    text: ct.table.map((row) => `${row[ci].colPct.toFixed(1)}%`),
    textposition: 'outside',
  }))

  return {
    id: `crosstab_grouped_${ct.columnId}_${Date.now()}`,
    type: 'groupedBar',
    data: traces,
    layout: {
      ...baseLayout,
      barmode: 'group',
      title: { text: `${truncateLabel(ct.columnName, 40)} by ${truncateLabel(ct.segmentName, 30)}` },
      yaxis: { title: { text: '% within segment' } },
      xaxis: { automargin: true },
    },
    config: baseConfig,
    stepId: 'crosstab',
    edits: {},
  }
}

function buildCrosstabTable(ct: CrosstabResult): ResultTable {
  // Build % distribution table: rows = segments, columns = scale points + Mean + N
  const columns = [
    { key: 'segment', label: ct.segmentName },
    ...ct.rowLabels.map((rl) => ({ key: `val_${rl}`, label: String(rl), numeric: true })),
    { key: 'mean', label: 'Mean', numeric: true },
    { key: 'n', label: 'N', numeric: true },
  ]

  const rows = ct.colLabels.map((seg, ci) => {
    const row: Record<string, string | number | null> = { segment: String(seg) }
    let sum = 0
    let count = 0
    for (let ri = 0; ri < ct.rowLabels.length; ri++) {
      const pct = ct.table[ri][ci].colPct
      row[`val_${ct.rowLabels[ri]}`] = `${Math.round(pct)}%`
      // Compute mean
      const val = Number(ct.rowLabels[ri])
      if (!isNaN(val)) {
        sum += val * ct.table[ri][ci].count
        count += ct.table[ri][ci].count
      }
    }
    row.mean = count > 0 ? Math.round((sum / count) * 100) / 100 : null
    row.n = ct.colTotals[ci]
    return row
  })

  return {
    id: `crosstab_table_${ct.columnId}_${Date.now()}`,
    title: `${ct.columnName} — % Distribution by ${ct.segmentName}`,
    columns,
    rows,
  }
}

const CrosstabPlugin: AnalysisPlugin = {
  id: 'crosstab',
  title: 'Cross-tabulation',
  desc: 'How does each segment respond? % distribution table and grouped bar chart.',
  priority: 20,
  reportPriority: 2,

  requires: ['ordinal', 'segment'],
  preconditions: [],

  produces: {
    description: 'Cross-tabulation table with counts, row%, col%, and index values',
    fields: { crosstabs: 'CrosstabResult[]' },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData, weights?: number[]): Promise<PluginStepResult> {
    if (!data.segment) throw new Error('CrosstabPlugin requires a segment column')

    const w = weights ?? data.weights
    const hasWeights = w != null && w.length === data.n

    const crosstabs = data.columns.map((col) =>
      computeCrosstab(col.values, data.segment!.values, col.name, col.id, data.segment!.name, col.nullMeaning ?? 'missing', hasWeights ? w : undefined)
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

      // Chi-square test of independence — skip if weighted (non-integer counts)
      let chiResult: { chiSquare: number; p: number; cramersV: number; df: number; warning: string | null } | null = null
      if (!hasWeights && ct.rowLabels.length >= 2 && ct.colLabels.length >= 2) {
        const observed = ct.table.map((row) => row.map((cell) => cell.count))
        try {
          // @ts-ignore
          const chi = StatsEngine.chiSquare(observed) as any
          if (!chi.error) {
            chiResult = {
              chiSquare: chi.chiSquare,
              p: chi.p,
              cramersV: chi.cramersV,
              df: chi.df,
              warning: chi.warning,
            }
          }
        } catch { /* ignore */ }
      }

      const isSig = chiResult !== null && chiResult.p < 0.05
      const cramersLabel = chiResult
        ? chiResult.cramersV > 0.5 ? 'large' : chiResult.cramersV > 0.3 ? 'medium' : chiResult.cramersV > 0.1 ? 'small' : 'negligible'
        : null

      let summaryLanguage: string
      if (isSig && chiResult) {
        summaryLanguage = `There is a significant association between ${ct.columnName} and ${ct.segmentName} (χ² = ${chiResult.chiSquare.toFixed(1)}, p ${chiResult.p < 0.001 ? '< .001' : '= ' + chiResult.p.toFixed(3)}, V = ${chiResult.cramersV.toFixed(2)}).`
      } else if (highIndex.length > 0) {
        summaryLanguage = `${ct.columnName} distribution varies across ${ct.segmentName} groups — "${highIndex[0]?.row}" is over-represented in "${highIndex[0]?.col}" (index ${highIndex[0]?.index.toFixed(0)}).`
      } else {
        summaryLanguage = `${ct.columnName} distribution is fairly even across ${ct.segmentName} groups.`
      }

      const chiSummary = chiResult
        ? ` χ²(${chiResult.df}) = ${chiResult.chiSquare.toFixed(2)}, p = ${chiResult.p < 0.001 ? '<.001' : chiResult.p.toFixed(3)}, Cramér's V = ${chiResult.cramersV.toFixed(3)} (${cramersLabel}).${chiResult.warning ? ' ' + chiResult.warning : ''}`
        : ''

      return {
        type: 'crosstab',
        title: `${ct.columnName} × ${ct.segmentName}`,
        summary: (highIndex.length > 0
          ? `${highIndex.length} cell(s) over-indexed (>130). Strongest: "${highIndex[0]?.row}" in "${highIndex[0]?.col}" (index ${highIndex[0]?.index.toFixed(0)}).`
          : `No strong over-indexing detected across ${ct.colLabels.length} segments.`) + chiSummary,
        summaryLanguage,
        detail: JSON.stringify({
          grandTotal: ct.grandTotal,
          nRows: ct.rowLabels.length,
          nCols: ct.colLabels.length,
          rowLabels: ct.rowLabels,
          colLabels: ct.colLabels,
          table: ct.table,
          rowTotals: ct.rowTotals,
          colTotals: ct.colTotals,
          chiSquare: chiResult,
        }),
        significant: isSig,
        pValue: chiResult?.p ?? null,
        effectSize: chiResult?.cramersV ?? null,
        effectLabel: cramersLabel,
        theme: null,
      }
    })

    // Build structured tables
    const tables: ResultTable[] = crosstabs.map(buildCrosstabTable)

    // Interpretation card
    const highIndex = crosstabs.flatMap((ct) =>
      ct.table.flatMap((row, ri) =>
        row.filter((c) => c.index > 130).map((c, ci) => ({
          colName: ct.columnName, row: ct.rowLabels[ri], col: ct.colLabels[ci], index: c.index,
        }))
      )
    )
    const interpretationCard = highIndex.length > 0
      ? `Response patterns differ across ${crosstabs[0]?.segmentName ?? 'segments'}. "${highIndex[0]?.col}" segment over-indexes on "${highIndex[0]?.row}" (${highIndex[0]?.index.toFixed(0)} vs 100 average).`
      : `Response patterns are fairly even across ${crosstabs[0]?.segmentName ?? 'segments'} — no segment stands out strongly on any item.`

    const columnNullMeanings = data.columns.map((c) => c.nullMeaning ?? 'missing')
    return {
      pluginId: 'crosstab',
      data: { crosstabs, columnNullMeanings },
      charts,
      findings,
      tables,
      interpretationCard,
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
