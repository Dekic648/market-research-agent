/**
 * CorrelationPlugin — Pearson/Spearman correlation matrix.
 *
 * Auto-switches to Spearman rank correlation when any column has
 * abs(skewness) > 2 — appropriate for skewed or zero-inflated data.
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
  correlationMethod: 'pearson' | 'spearman'
  columnSkewness?: number[]
}

function buildCorrelationHeatmap(r: CorrelationResult): ChartConfig {
  const methodLabel = r.correlationMethod === 'spearman' ? 'Spearman Rank' : 'Pearson'
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
        row.map((v, j) => `${r.correlationMethod === 'spearman' ? 'rho' : 'r'} = ${v.toFixed(3)}${r.pValues[i][j] < 0.05 ? '*' : ''}`)
      ),
      hoverinfo: 'text',
    }],
    layout: {
      ...baseLayout,
      title: { text: `${methodLabel} Correlation Matrix` },
      xaxis: { tickangle: -45 },
      yaxis: { automargin: true },
    },
    config: baseConfig,
    stepId: 'correlation',
    edits: {},
  }
}

const SKEWNESS_THRESHOLD = 2

const CorrelationPlugin: AnalysisPlugin = {
  id: 'correlation',
  title: 'Correlation Matrix',
  desc: 'Correlation matrix with significance markers. Auto-switches to Spearman for skewed data.',
  priority: 80,
  reportPriority: 4,
  requires: ['continuous'],
  preconditions: [],
  produces: { description: 'Correlation matrix with p-values and method flag', fields: { result: 'CorrelationResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 2) throw new Error('Correlation requires at least 2 columns')

    const items = data.columns.map((col) =>
      col.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    )

    // Compute skewness per column to decide method
    const columnSkewness = items.map((vals) => {
      const clean = vals.filter((v) => !isNaN(v))
      if (clean.length < 3) return 0
      // @ts-ignore
      return StatsEngine._helpers.skewness(clean) as number
    })

    const useSpearman = columnSkewness.some((s) => Math.abs(s) > SKEWNESS_THRESHOLD)
    const correlationMethod: 'pearson' | 'spearman' = useSpearman ? 'spearman' : 'pearson'

    // Compute correlation matrix using appropriate method
    let rMatrix: number[][]
    let pMatrix: number[][]

    if (useSpearman) {
      // Compute pairwise Spearman correlations
      const k = items.length
      rMatrix = Array.from({ length: k }, () => Array(k).fill(1))
      pMatrix = Array.from({ length: k }, () => Array(k).fill(0))

      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          // Filter to complete cases for this pair
          const validPairs: Array<[number, number]> = []
          for (let r = 0; r < items[i].length; r++) {
            if (!isNaN(items[i][r]) && !isNaN(items[j][r])) {
              validPairs.push([items[i][r], items[j][r]])
            }
          }
          if (validPairs.length < 3) continue

          // @ts-ignore
          const sr = StatsEngine.spearman(
            validPairs.map((p) => p[0]),
            validPairs.map((p) => p[1])
          ) as any
          const rho = sr.error ? 0 : (sr.rho ?? sr.r ?? 0)
          const p = sr.error ? 1 : (sr.p ?? 1)
          rMatrix[i][j] = rho
          rMatrix[j][i] = rho
          pMatrix[i][j] = p
          pMatrix[j][i] = p
        }
      }
    } else {
      // @ts-ignore
      const cm = StatsEngine.correlationMatrix(items) as { r: number[][]; p: number[][]; k: number }
      rMatrix = cm.r
      pMatrix = cm.p
    }

    const strongPairs: CorrelationResult['strongPairs'] = []
    for (let i = 0; i < data.columns.length; i++) {
      for (let j = i + 1; j < data.columns.length; j++) {
        if (Math.abs(rMatrix[i][j]) > 0.5 && pMatrix[i][j] < 0.05) {
          strongPairs.push({ a: data.columns[i].name, b: data.columns[j].name, r: rMatrix[i][j], p: pMatrix[i][j] })
        }
      }
    }
    strongPairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))

    const result: CorrelationResult = {
      matrix: rMatrix,
      pValues: pMatrix,
      columnNames: data.columns.map((c) => c.name),
      strongPairs,
      correlationMethod,
      columnSkewness,
    }

    const charts = [buildCorrelationHeatmap(result)]
    const rLabel = correlationMethod === 'spearman' ? 'rho' : 'r'

    const findings = strongPairs.slice(0, 5).map((pair) => {
      const summaryLanguage = Math.abs(pair.r) > 0.7
        ? `${pair.a} and ${pair.b} move together — higher ${pair.a} consistently accompanies ${pair.r > 0 ? 'higher' : 'lower'} ${pair.b}.`
        : `${pair.a} and ${pair.b} are weakly related.`

      return {
        type: 'correlation',
        title: `${pair.a} ↔ ${pair.b}: ${rLabel} = ${pair.r.toFixed(3)}`,
        summary: `${Math.abs(pair.r) > 0.7 ? 'Strong' : 'Moderate'} ${pair.r > 0 ? 'positive' : 'negative'} correlation (p ${pair.p < 0.001 ? '< .001' : '= ' + pair.p.toFixed(3)}).${correlationMethod === 'spearman' ? ' Spearman rank correlation used — appropriate for skewed or zero-inflated data.' : ''}`,
        summaryLanguage,
        detail: JSON.stringify(pair),
        significant: true,
        pValue: pair.p,
        effectSize: pair.r,
        effectLabel: Math.abs(pair.r) > 0.7 ? 'strong' : 'moderate',
        theme: null,
      }
    })

    return {
      pluginId: 'correlation', data: { result }, charts, findings,
      plainLanguage: this.plainLanguage({ pluginId: 'correlation', data: { result }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'correlation', nVars: data.columns.length, nStrong: strongPairs.length, method: correlationMethod } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: CorrelationResult }).result
    if (!r) return 'No correlation results.'

    const methodNote = r.correlationMethod === 'spearman'
      ? 'Spearman rank correlation used — appropriate for skewed or zero-inflated data. '
      : ''

    if (r.strongPairs.length === 0) {
      return `${methodNote}No strong correlations found among the ${r.columnNames.length} variables (all |r| < .5).`
    }
    const top = r.strongPairs[0]
    const strength = Math.abs(top.r) > 0.7 ? 'strongly' : 'moderately'
    const direction = top.r > 0 ? 'positively' : 'negatively'
    return `${methodNote}${top.a} and ${top.b} are ${strength} ${direction} correlated (r = ${top.r.toFixed(2)}). Higher ${top.a} tends to go with ${top.r > 0 ? 'higher' : 'lower'} ${top.b}.`
  },
}

AnalysisRegistry.register(CorrelationPlugin)
export { CorrelationPlugin }
