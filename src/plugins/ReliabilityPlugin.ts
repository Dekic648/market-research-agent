/**
 * ReliabilityPlugin — Cronbach's α with item-total diagnostics.
 *
 * IMPORTANT: reads ColumnDefinition.transformStack for reverseCode flags.
 * Reversed items are handled automatically via resolveColumn — do NOT re-reverse.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors, truncateLabel } from '../engine/chartDefaults'
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
      y: r.columnNames.map((n) => truncateLabel(n, 50)),
      x: r.itemTotalCorrelations,
      type: 'bar',
      orientation: 'h',
      marker: {
        color: r.itemTotalCorrelations.map((c) => c < 0.3 ? '#e24b4a' : brandColors[0]),
      },
      text: r.itemTotalCorrelations.map((c) => c.toFixed(3)),
      textposition: 'outside',
      customdata: r.columnNames,
      hovertemplate: '%{customdata}<br>r = %{x:.3f}<extra></extra>',
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
  desc: 'Do these items belong together as a scale? Can they be combined into one score?',
  priority: 50,
  reportPriority: 5,
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

    const blockLabel = data.columns.map((c) => c.name).join(', ')
    const findings: Array<Record<string, unknown>> = [{
      type: 'reliability',
      title: `Cronbach's α = ${ca.alpha.toFixed(3)} (${result.level})`,
      summary: `${ca.k} items, n = ${ca.n}. ${weakItems.length > 0 ? `Weak items (r < .3): ${weakItems.join(', ')}.` : 'All items adequate.'}`,
      summaryLanguage: `The ${blockLabel} scale holds together well (${ca.k} items, ${result.level} consistency).`,
      detail: JSON.stringify({ alphaIfDeleted: ca.alphaIfDeleted }),
      significant: ca.alpha >= 0.7,
      pValue: null,
      effectSize: ca.alpha,
      effectLabel: result.level,
      theme: null,
    }]

    // Cohen's Kappa — exactly 2 columns with identical value sets (inter-rater agreement)
    if (data.columns.length === 2) {
      const vals0 = new Set(data.columns[0].values.filter((v) => v !== null))
      const vals1 = new Set(data.columns[1].values.filter((v) => v !== null))
      const sameValueSet = vals0.size === vals1.size && [...vals0].every((v) => vals1.has(v))

      if (sameValueSet && vals0.size >= 2) {
        const rater1 = filteredItems[0]
        const rater2 = filteredItems[1]
        // @ts-ignore
        const ck = StatsEngine.cohensKappa(rater1, rater2) as any

        if (!ck.error) {
          const kappa = ck.kappa ?? 0
          const kappaLabel = kappa > 0.8 ? 'almost perfect'
            : kappa > 0.6 ? 'substantial'
            : kappa > 0.4 ? 'moderate'
            : kappa > 0.2 ? 'fair'
            : 'slight'

          const interpretation = kappa > 0.8 ? 'The two measures classify respondents nearly identically.'
            : kappa > 0.6 ? 'There is strong agreement between the two measures.'
            : kappa > 0.4 ? 'Agreement is moderate — some disagreement exists.'
            : kappa > 0.2 ? 'Agreement is only fair — substantial disagreement.'
            : 'Agreement is slight — the two measures largely disagree.'

          findings.push({
            type: 'reliability_kappa',
            title: `Inter-rater Agreement — ${columnNames[0]} vs ${columnNames[1]}`,
            summary: `κ = ${kappa.toFixed(3)}, p = ${ck.p < 0.001 ? '<.001' : ck.p.toFixed(3)}. Observed agreement: ${(ck.observedAgreement * 100).toFixed(1)}%, expected by chance: ${(ck.expectedAgreement * 100).toFixed(1)}%.`,
            summaryLanguage: `Agreement between ${columnNames[0]} and ${columnNames[1]} is ${kappaLabel} (κ = ${kappa.toFixed(2)}). ${interpretation}`,
            detail: JSON.stringify({ kappa, p: ck.p, observedAgreement: ck.observedAgreement, expectedAgreement: ck.expectedAgreement, ci95: ck.ci95 }),
            significant: ck.p < 0.05,
            pValue: ck.p,
            effectSize: kappa,
            effectLabel: kappaLabel,
            theme: null,
          })
        }
      }
    }

    return {
      pluginId: 'cronbach',
      data: { result },
      charts,
      findings: findings as any,
      plainLanguage: this.plainLanguage({ pluginId: 'cronbach', data: { result }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'cronbach', alpha: ca.alpha, k: ca.k } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: ReliabilityResult }).result
    if (!r) return 'No reliability results.'
    const reliableWord = r.alpha >= 0.7 ? 'reliable' : r.alpha >= 0.6 ? 'questionable' : 'unreliable'
    let interpretation = ''
    if (r.alpha >= 0.9) interpretation = 'The items are highly consistent and can be confidently combined into a single score.'
    else if (r.alpha >= 0.8) interpretation = 'The items are consistent enough to combine into a composite score.'
    else if (r.alpha >= 0.7) interpretation = 'The scale meets the minimum threshold for research use.'
    else if (r.alpha >= 0.6) interpretation = 'The scale is borderline — consider revising items before drawing conclusions.'
    else interpretation = 'The items do not form a coherent scale and should not be combined.'
    const weakNote = r.weakItems.length > 0 ? ` Removing ${r.weakItems.join(' or ')} may improve consistency.` : ''
    return `The ${r.k} items form a ${reliableWord} scale (alpha = ${r.alpha.toFixed(2)}). ${interpretation}${weakNote}`
  },
}

AnalysisRegistry.register(ReliabilityPlugin)
export { ReliabilityPlugin }
