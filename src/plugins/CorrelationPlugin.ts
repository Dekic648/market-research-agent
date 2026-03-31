/**
 * CorrelationPlugin — Pearson/Spearman correlation matrix.
 *
 * Auto-switches to Spearman rank correlation when any column has
 * abs(skewness) > 2 — appropriate for skewed or zero-inflated data.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, truncateLabels } from '../engine/chartDefaults'
import { OUTCOME_KEYWORDS } from '../engine/analysisPlan'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface CorrelationResult {
  matrix: number[][]
  pValues: number[][]
  columnNames: string[]
  strongPairs: Array<{ a: string; b: string; r: number; p: number; method?: 'pearson' | 'spearman' | 'kendall' }>
  correlationMethod: 'pearson' | 'spearman'
  columnSkewness?: number[]
}

function buildCorrelationHeatmap(r: CorrelationResult): ChartConfig {
  const methodLabel = r.correlationMethod === 'spearman' ? 'Spearman Rank' : 'Pearson'
  const labels = truncateLabels(r.columnNames, 45)

  return {
    id: `correlation_heatmap_${Date.now()}`,
    type: 'heatmap',
    data: [{
      z: r.matrix,
      x: labels.display,
      y: labels.display,
      type: 'heatmap',
      colorscale: [[0, '#e24b4a'], [0.5, '#f8f7f4'], [1, '#1d9e75']],
      zmid: 0,
      zmin: -1,
      zmax: 1,
      text: r.matrix.map((row, i) =>
        row.map((v, j) => {
          const sym = r.correlationMethod === 'spearman' ? 'rho' : 'r'
          const sig = r.pValues[i][j] < 0.05 ? '*' : ''
          return `${labels.full[i]} × ${labels.full[j]}<br>${sym} = ${v.toFixed(3)}${sig}`
        })
      ),
      hoverinfo: 'text',
    }],
    layout: {
      ...baseLayout,
      title: { text: `${methodLabel} Correlation Matrix` },
      xaxis: { tickangle: -45, automargin: true },
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
  desc: 'Which measures move together? When one goes up, does the other?',
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

    // Detect ordinal columns (≤ 10 unique integer values)
    const isOrdinal = items.map((vals) => {
      const clean = vals.filter((v) => !isNaN(v))
      const unique = new Set(clean)
      return unique.size >= 2 && unique.size <= 10 && clean.every((v) => Number.isInteger(v))
    })

    const strongPairs: CorrelationResult['strongPairs'] = []
    for (let i = 0; i < data.columns.length; i++) {
      for (let j = i + 1; j < data.columns.length; j++) {
        let r = rMatrix[i][j]
        let p = pMatrix[i][j]
        let pairMethod: 'pearson' | 'spearman' | 'kendall' = correlationMethod

        // Both ordinal → use Kendall's Tau (better suited for ordinal pairs)
        if (isOrdinal[i] && isOrdinal[j]) {
          const cleanI = items[i].filter((_, idx) => !isNaN(items[i][idx]) && !isNaN(items[j][idx]))
          const cleanJ = items[j].filter((_, idx) => !isNaN(items[i][idx]) && !isNaN(items[j][idx]))
          if (cleanI.length >= 5) {
            // @ts-ignore
            const kt = StatsEngine.kendallTau(cleanI, cleanJ) as any
            if (!kt.error) {
              r = kt.tau ?? r
              p = kt.p ?? p
              pairMethod = 'kendall'
            }
          }
        }

        if (Math.abs(r) > 0.5 && p < 0.05) {
          strongPairs.push({ a: data.columns[i].name, b: data.columns[j].name, r, p, method: pairMethod })
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

    // Detect outcome column for driver callout
    const outcomeCol = data.columns.find((col) => {
      const lower = col.name.toLowerCase()
      return OUTCOME_KEYWORDS.some((kw) => lower.includes(kw))
    })
    const outcomeName = outcomeCol?.name ?? null

    // Find the highest-|r| pair involving the outcome (for driver framing)
    const outcomeTopPair = outcomeName
      ? strongPairs.find((p) => p.a === outcomeName || p.b === outcomeName)
      : null

    const findings = strongPairs.slice(0, 5).map((pair) => {
      const dir = pair.r > 0 ? 'higher' : 'lower'
      const pairMethod = pair.method ?? correlationMethod
      const rLabel = pairMethod === 'kendall' ? 'τ' : pairMethod === 'spearman' ? 'ρ' : 'r'

      // Driver callout: reframe the top outcome pair asymmetrically
      let summaryLanguage: string
      if (outcomeTopPair && pair.a === outcomeTopPair.a && pair.b === outcomeTopPair.b) {
        const predictor = pair.a === outcomeName ? pair.b : pair.a
        summaryLanguage = `${predictor} is the strongest correlate of ${outcomeName} (${rLabel} = ${pair.r.toFixed(2)}).`
      } else if (Math.abs(pair.r) > 0.7) {
        summaryLanguage = `${pair.a} and ${pair.b} move together — higher ${pair.a} consistently accompanies ${dir} ${pair.b}.`
      } else if (Math.abs(pair.r) > 0.4) {
        summaryLanguage = `${pair.a} and ${pair.b} are moderately related — ${dir} ${pair.a} tends to accompany ${dir} ${pair.b}.`
      } else {
        summaryLanguage = `${pair.a} and ${pair.b} show a weak relationship.`
      }

      // Redundancy flag for near-duplicate columns
      const redundancyFlag = Math.abs(pair.r) > 0.8
      const methodNote = pairMethod === 'kendall' ? " Kendall's Tau used — appropriate for ordinal data."
        : pairMethod === 'spearman' ? ' Spearman rank correlation used — appropriate for skewed or zero-inflated data.'
        : ''

      return {
        type: 'correlation',
        title: `${pair.a} ↔ ${pair.b}: ${rLabel} = ${pair.r.toFixed(3)}`,
        summary: `${Math.abs(pair.r) > 0.7 ? 'Strong' : 'Moderate'} ${pair.r > 0 ? 'positive' : 'negative'} correlation (p ${pair.p < 0.001 ? '< .001' : '= ' + pair.p.toFixed(3)}).${methodNote}${redundancyFlag ? ' Warning: r > 0.8 — these columns may be measuring the same thing. Consider merging or dropping one.' : ''}`,
        summaryLanguage,
        detail: JSON.stringify({ ...pair, redundancyFlag, method: pairMethod }),
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
