/**
 * CorrelationPlugin — Pearson/Spearman correlation matrix.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface CorrelationResult {
  matrix: number[][]
  pValues: number[][]
  columnNames: string[]
  strongPairs: Array<{ a: string; b: string; r: number; p: number }>
}

function buildCorrelationHeatmap(r: CorrelationResult): ChartConfig {
  return {
    id: `correlation_heatmap_${Date.now()}`,
    type: 'heatmap',
    data: [{
      z: r.matrix,
      x: r.columnNames,
      y: r.columnNames,
      type: 'heatmap',
      colorscale: [[0, '#e24b4a'], [0.5, '#f8f7f4'], [1, '#1d9e75']],
      zmid: 0,
      zmin: -1,
      zmax: 1,
      text: r.matrix.map((row, i) =>
        row.map((v, j) => `r = ${v.toFixed(3)}${r.pValues[i][j] < 0.05 ? '*' : ''}`)
      ),
      hoverinfo: 'text',
    }],
    layout: {
      ...baseLayout,
      title: { text: 'Correlation Matrix' },
      xaxis: { tickangle: -45 },
      yaxis: { automargin: true },
    },
    config: baseConfig,
    stepId: 'correlation',
    edits: {},
  }
}

const CorrelationPlugin: AnalysisPlugin = {
  id: 'correlation',
  title: 'Correlation Matrix',
  desc: 'Pearson correlation matrix with significance markers.',
  priority: 80,
  requires: ['continuous'],
  preconditions: [],
  produces: { description: 'Correlation matrix with p-values', fields: { result: 'CorrelationResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 2) throw new Error('Correlation requires at least 2 columns')

    const items = data.columns.map((col) =>
      col.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    )

    // @ts-ignore
    const cm = StatsEngine.correlationMatrix(items) as { r: number[][]; p: number[][]; k: number }

    const strongPairs: CorrelationResult['strongPairs'] = []
    for (let i = 0; i < data.columns.length; i++) {
      for (let j = i + 1; j < data.columns.length; j++) {
        if (Math.abs(cm.r[i][j]) > 0.5 && cm.p[i][j] < 0.05) {
          strongPairs.push({ a: data.columns[i].name, b: data.columns[j].name, r: cm.r[i][j], p: cm.p[i][j] })
        }
      }
    }
    strongPairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))

    const result: CorrelationResult = {
      matrix: cm.r,
      pValues: cm.p,
      columnNames: data.columns.map((c) => c.name),
      strongPairs,
    }

    const charts = [buildCorrelationHeatmap(result)]

    const findings = strongPairs.slice(0, 5).map((pair) => ({
      type: 'correlation',
      title: `${pair.a} ↔ ${pair.b}: r = ${pair.r.toFixed(3)}`,
      summary: `${Math.abs(pair.r) > 0.7 ? 'Strong' : 'Moderate'} ${pair.r > 0 ? 'positive' : 'negative'} correlation (p ${pair.p < 0.001 ? '< .001' : '= ' + pair.p.toFixed(3)}).`,
      detail: JSON.stringify(pair),
      significant: true,
      pValue: pair.p,
      effectSize: pair.r,
      effectLabel: Math.abs(pair.r) > 0.7 ? 'strong' : 'moderate',
      theme: null,
    }))

    return {
      pluginId: 'correlation', data: { result }, charts, findings,
      plainLanguage: `${strongPairs.length} strong correlation(s) found (|r| > .5) among ${data.columns.length} variables.`,
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'correlation', nVars: data.columns.length, nStrong: strongPairs.length } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: CorrelationResult }).result
    if (!r) return 'No correlation results.'
    return `${r.strongPairs.length} strong correlation(s) among ${r.columnNames.length} variables.`
  },
}

AnalysisRegistry.register(CorrelationPlugin)
export { CorrelationPlugin }
