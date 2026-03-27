/**
 * ReliabilityPlugin — Cronbach's α with item-total diagnostics.
 *
 * IMPORTANT: reads ColumnDefinition.transformStack for reverseCode flags.
 * Reversed items are handled automatically via resolveColumn — do NOT re-reverse.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface ReliabilityResult {
  alpha: number
  k: number
  n: number
  itemTotalCorrelations: number[]
  alphaIfDeleted: number[]
  columnNames: string[]
  weakItems: string[]
  level: string
}

function alphaLevel(a: number): string {
  if (a >= 0.9) return 'excellent'
  if (a >= 0.8) return 'good'
  if (a >= 0.7) return 'acceptable'
  if (a >= 0.6) return 'questionable'
  if (a >= 0.5) return 'poor'
  return 'unacceptable'
}

function buildItemDiagnosticChart(r: ReliabilityResult): ChartConfig {
  return {
    id: `reliability_items_${Date.now()}`,
    type: 'horizontalBar',
    data: [{
      y: r.columnNames,
      x: r.itemTotalCorrelations,
      type: 'bar',
      orientation: 'h',
      marker: {
        color: r.itemTotalCorrelations.map((c) => c < 0.3 ? '#e24b4a' : brandColors[0]),
      },
      text: r.itemTotalCorrelations.map((c) => c.toFixed(3)),
      textposition: 'outside',
    }],
    layout: {
      ...baseLayout,
      title: { text: `Item-Total Correlations (α = ${r.alpha.toFixed(3)})` },
      xaxis: { title: { text: 'Corrected Item-Total r' }, range: [-0.2, 1] },
      yaxis: { automargin: true },
      shapes: [{ type: 'line', x0: 0.3, x1: 0.3, y0: -0.5, y1: r.k - 0.5, line: { color: '#e24b4a', width: 1, dash: 'dash' } }],
    },
    config: baseConfig,
    stepId: 'cronbach',
    edits: {},
  }
}

const ReliabilityPlugin: AnalysisPlugin = {
  id: 'cronbach',
  title: "Cronbach's Alpha",
  desc: 'Scale reliability with item-total correlations and alpha-if-deleted diagnostics.',
  priority: 50,
  requires: ['ordinal', 'n>30'],
  preconditions: [],
  produces: { description: 'Cronbach α, item-total correlations, alpha-if-deleted', fields: { result: 'ReliabilityResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 2) throw new Error('Reliability requires at least 2 items')

    // Extract numeric arrays — resolveColumn already handled reverseCode
    const items: number[][] = data.columns.map((col) =>
      col.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    )

    // Filter to rows where all items have valid values
    const n = items[0].length
    const validRows: number[] = []
    for (let i = 0; i < n; i++) {
      if (items.every((item) => !isNaN(item[i]))) validRows.push(i)
    }

    const filteredItems = items.map((item) => validRows.map((i) => item[i]))

    // @ts-ignore
    const ca = StatsEngine.cronbachAlpha(filteredItems) as { alpha: number; k: number; n: number; itemTotalCorrelations: number[]; alphaIfDeleted: number[] }

    const columnNames = data.columns.map((c) => c.name)
    const weakItems = columnNames.filter((_, i) => ca.itemTotalCorrelations[i] < 0.3)

    const result: ReliabilityResult = {
      alpha: ca.alpha,
      k: ca.k,
      n: ca.n,
      itemTotalCorrelations: ca.itemTotalCorrelations,
      alphaIfDeleted: ca.alphaIfDeleted,
      columnNames,
      weakItems,
      level: alphaLevel(ca.alpha),
    }

    const charts = [buildItemDiagnosticChart(result)]

    const findings = [{
      type: 'reliability',
      title: `Cronbach's α = ${ca.alpha.toFixed(3)} (${result.level})`,
      summary: `${ca.k} items, n = ${ca.n}. ${weakItems.length > 0 ? `Weak items (r < .3): ${weakItems.join(', ')}.` : 'All items adequate.'}`,
      detail: JSON.stringify({ alphaIfDeleted: ca.alphaIfDeleted }),
      significant: ca.alpha >= 0.7,
      pValue: null,
      effectSize: ca.alpha,
      effectLabel: result.level,
      theme: null,
    }]

    return {
      pluginId: 'cronbach',
      data: { result },
      charts,
      findings,
      plainLanguage: this.plainLanguage({ pluginId: 'cronbach', data: { result }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'cronbach', alpha: ca.alpha, k: ca.k } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: ReliabilityResult }).result
    if (!r) return 'No reliability results.'
    return `Cronbach's α = ${r.alpha.toFixed(3)} (${r.level}) across ${r.k} items (n = ${r.n}). ${r.weakItems.length > 0 ? `Consider removing: ${r.weakItems.join(', ')}.` : 'All items contribute well to the scale.'}`
  },
}

AnalysisRegistry.register(ReliabilityPlugin)
export { ReliabilityPlugin }
