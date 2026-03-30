/**
 * FactorPlugin — Exploratory Factor Analysis (EFA) with Varimax rotation.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors, truncateLabel } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData,
  Validator, AssumptionCheck, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface FactorResult {
  nFactors: number
  loadings: number[][]       // k items × nFactors
  eigenvalues: number[]
  varianceExplained: number[]
  cumulativeVariance: number[]
  communalities: number[]
  columnNames: string[]
}

function buildScreePlot(eigenvalues: number[]): ChartConfig {
  return {
    id: `factor_scree_${Date.now()}`,
    type: 'scatterPlot',
    data: [{
      x: eigenvalues.map((_, i) => i + 1),
      y: eigenvalues,
      type: 'scatter',
      mode: 'lines+markers',
      marker: { size: 8, color: brandColors[0] },
      line: { color: brandColors[0] },
      name: 'Eigenvalues',
    }, {
      x: [0.5, eigenvalues.length + 0.5],
      y: [1, 1],
      type: 'scatter',
      mode: 'lines',
      line: { color: '#e24b4a', width: 1, dash: 'dash' },
      name: 'Kaiser criterion (λ = 1)',
    }],
    layout: {
      ...baseLayout,
      title: { text: 'Scree Plot' },
      xaxis: { title: { text: 'Component' }, dtick: 1 },
      yaxis: { title: { text: 'Eigenvalue' } },
      showlegend: true,
    },
    config: baseConfig,
    stepId: 'efa',
    edits: {},
  }
}

function buildLoadingsHeatmap(r: FactorResult): ChartConfig {
  const yDisplay = r.columnNames.map((n) => truncateLabel(n, 45))
  return {
    id: `factor_loadings_${Date.now()}`,
    type: 'heatmap',
    data: [{
      z: r.loadings,
      x: Array.from({ length: r.nFactors }, (_, i) => `Factor ${i + 1}`),
      y: yDisplay,
      type: 'heatmap',
      colorscale: [[0, '#e24b4a'], [0.5, '#f8f7f4'], [1, '#1d9e75']],
      zmid: 0,
      text: r.loadings.map((row, ri) => row.map((v) => `${r.columnNames[ri]}<br>Loading: ${v.toFixed(3)}`)),
      hoverinfo: 'text',
    }],
    layout: {
      ...baseLayout,
      title: { text: `Factor Loadings (${r.nFactors} factors)` },
      yaxis: { automargin: true },
    },
    config: baseConfig,
    stepId: 'efa',
    edits: {},
  }
}

const minN: Validator = {
  name: 'minN(100)',
  validate(data: ResolvedColumnData): AssumptionCheck {
    const passed = data.n >= 100
    return {
      name: 'minN',
      passed,
      message: passed ? `n = ${data.n} (≥ 100)` : `n = ${data.n} — factor analysis typically requires n ≥ 100`,
      severity: passed ? 'info' : 'warning',
    }
  },
}

const FactorPlugin: AnalysisPlugin = {
  id: 'efa',
  title: 'Exploratory Factor Analysis',
  desc: 'Are there underlying themes? Do items group into natural clusters?',
  priority: 60,
  reportPriority: 5,
  requires: ['ordinal', 'n>30'],
  preconditions: [minN],
  produces: { description: 'Factor loadings, eigenvalues, variance explained', fields: { result: 'FactorResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 3) throw new Error('Factor analysis requires at least 3 items')

    const items: number[][] = data.columns.map((col) =>
      col.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    )

    // Filter to complete cases
    const n = items[0].length
    const validRows: number[] = []
    for (let i = 0; i < n; i++) {
      if (items.every((item) => !isNaN(item[i]))) validRows.push(i)
    }
    const filtered = items.map((item) => validRows.map((i) => item[i]))

    // Determine nFactors via Kaiser criterion (eigenvalues > 1)
    // @ts-ignore
    const pcaResult = StatsEngine.pca(filtered)
    const nFactorsKaiser = pcaResult.eigenvalues.filter((e: number) => e > 1).length
    const nFactors = Math.max(1, Math.min(nFactorsKaiser, Math.floor(data.columns.length / 2)))

    // @ts-ignore
    const fa = StatsEngine.factorAnalysis(filtered, { nFactors })

    const result: FactorResult = {
      nFactors,
      loadings: fa.loadings,
      eigenvalues: pcaResult.eigenvalues,
      varianceExplained: pcaResult.explainedVariance.slice(0, nFactors),
      cumulativeVariance: pcaResult.cumulativeVariance.slice(0, nFactors),
      communalities: fa.communalities,
      columnNames: data.columns.map((c) => c.name),
    }

    const totalVar = result.cumulativeVariance[result.cumulativeVariance.length - 1] ?? 0
    const charts = [buildScreePlot(pcaResult.eigenvalues), buildLoadingsHeatmap(result)]
    const assumptions = this.preconditions.map((v) => v.validate(data))

    // Identify top-loading items for Factor 1 for summaryLanguage
    const factor1Items = result.columnNames
      .map((name, i) => ({ name, loading: result.loadings[i]?.[0] ?? 0 }))
      .filter((x) => Math.abs(x.loading) > 0.4)
      .sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading))
      .slice(0, 3)
    const factor1Str = factor1Items.length > 0
      ? factor1Items.map((x) => x.name).join(', ')
      : result.columnNames[0] ?? 'the items'

    const findings = [{
      type: 'factor_analysis',
      title: `${nFactors} factor(s) extracted, explaining ${(totalVar * 100).toFixed(1)}% of variance`,
      summary: `Kaiser criterion identified ${nFactorsKaiser} factor(s) with eigenvalue > 1. Varimax rotation applied.`,
      summaryLanguage: `${nFactors} underlying factor${nFactors === 1 ? '' : 's'} explain ${(totalVar * 100).toFixed(0)}% of variance. Factor 1 groups ${factor1Str}.`,
      detail: JSON.stringify({ eigenvalues: pcaResult.eigenvalues.slice(0, 5) }),
      significant: totalVar > 0.5,
      pValue: null,
      effectSize: totalVar,
      effectLabel: totalVar > 0.7 ? 'strong' : totalVar > 0.5 ? 'adequate' : 'weak',
      theme: null,
    }]

    return {
      pluginId: 'efa',
      data: { result },
      charts,
      findings,
      plainLanguage: this.plainLanguage({ pluginId: 'efa', data: { result }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions,
      logEntry: { type: 'analysis_run', payload: { pluginId: 'efa', nFactors, totalVariance: totalVar } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: FactorResult }).result
    if (!r) return 'No factor analysis results.'
    const totalVar = r.cumulativeVariance[r.cumulativeVariance.length - 1] ?? 0
    // Identify top-loading items per factor
    const factorDescriptions: string[] = []
    for (let f = 0; f < r.nFactors && f < 3; f++) {
      const itemsWithLoadings = r.columnNames.map((name, i) => ({ name, loading: r.loadings[i]?.[f] ?? 0 }))
        .filter((x) => Math.abs(x.loading) > 0.4)
        .sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading))
        .slice(0, 2)
      if (itemsWithLoadings.length > 0) {
        factorDescriptions.push(itemsWithLoadings.map((x) => x.name).join(' and '))
      }
    }
    const clusterStr = factorDescriptions.length > 0
      ? ` ${factorDescriptions[0]} cluster together${factorDescriptions.length > 1 ? `; ${factorDescriptions[1]} form a second group` : ''}.`
      : ''
    return `The ${r.columnNames.length} items group into ${r.nFactors} underlying themes, explaining ${(totalVar * 100).toFixed(0)}% of the total variation.${clusterStr}`
  },
}

AnalysisRegistry.register(FactorPlugin)
export { FactorPlugin }
