/**
 * SignificancePlugin — Kruskal-Wallis / ANOVA by segment.
 *
 * Tests whether each column differs significantly across segments.
 * Produces: H-statistic, p-value, epsilon-squared effect size per column.
 * Charts: significanceMap.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin,
  PluginStepResult,
  ResolvedColumnData,
  Validator,
  AssumptionCheck,
  OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface ColumnSignificance {
  columnId: string
  columnName: string
  testUsed: string
  H: number
  p: number
  df: number
  epsilonSquared: number
  effectLabel: string
  nPerGroup: number[]
  groupMeans: number[]
}

function effectLabel(eps: number): string {
  if (eps < 0.01) return 'negligible'
  if (eps < 0.06) return 'small'
  if (eps < 0.14) return 'medium'
  return 'large'
}

function computeSignificance(
  colValues: (number | string | null)[],
  segValues: (number | string | null)[],
  colName: string,
  colId: string
): ColumnSignificance | null {
  // Group values by segment
  const groups = new Map<string | number, number[]>()
  const n = Math.min(colValues.length, segValues.length)

  for (let i = 0; i < n; i++) {
    if (colValues[i] === null || segValues[i] === null) continue
    const num = typeof colValues[i] === 'number' ? colValues[i] as number : parseFloat(String(colValues[i]))
    if (isNaN(num)) continue
    const seg = segValues[i] as string | number
    if (!groups.has(seg)) groups.set(seg, [])
    groups.get(seg)!.push(num)
  }

  if (groups.size < 2) return null

  const groupArrays = Array.from(groups.values())

  // Check minimum group size
  if (groupArrays.some((g) => g.length < 2)) return null

  // Run Kruskal-Wallis
  // @ts-ignore — stats engine is @ts-nocheck
  const kw = StatsEngine.kruskalWallis(groupArrays)

  const N = groupArrays.reduce((s, g) => s + g.length, 0)
  const eps = (kw.H - groups.size + 1) / (N - groups.size)

  return {
    columnId: colId,
    columnName: colName,
    testUsed: 'Kruskal-Wallis',
    H: kw.H,
    p: kw.p,
    df: kw.df,
    epsilonSquared: Math.max(0, eps),
    effectLabel: effectLabel(Math.max(0, eps)),
    nPerGroup: groupArrays.map((g) => g.length),
    groupMeans: groupArrays.map((g) => g.reduce((s, v) => s + v, 0) / g.length),
  }
}

function buildSignificanceMap(results: ColumnSignificance[]): ChartConfig {
  const sorted = [...results].sort((a, b) => a.p - b.p)
  const negLogP = sorted.map((r) => -Math.log10(Math.max(r.p, 1e-300)))
  const threshold = -Math.log10(0.05)

  return {
    id: `significance_map_${Date.now()}`,
    type: 'significanceMap',
    data: [
      {
        y: sorted.map((r) => r.columnName),
        x: negLogP,
        type: 'bar',
        orientation: 'h',
        marker: {
          color: sorted.map((r) => r.p < 0.05 ? brandColors[0] : '#b4b2a9'),
        },
        text: sorted.map((r) => `p=${r.p < 0.001 ? '<.001' : r.p.toFixed(3)}`),
        textposition: 'outside',
      },
      {
        x: [threshold, threshold],
        y: [sorted[0]?.columnName ?? '', sorted[sorted.length - 1]?.columnName ?? ''],
        mode: 'lines',
        line: { color: '#e24b4a', width: 2, dash: 'dash' },
        name: 'p = 0.05',
        showlegend: true,
      },
    ],
    layout: {
      ...baseLayout,
      title: { text: 'Significance Map (−log₁₀ p)' },
      xaxis: { title: { text: '−log₁₀(p)' } },
      yaxis: { automargin: true },
      showlegend: true,
    },
    config: baseConfig,
    stepId: 'kw_significance',
    edits: {},
  }
}

// Precondition: minimum 5 per group
const minGroupSize: Validator = {
  name: 'minGroupSize(5)',
  validate(data: ResolvedColumnData): AssumptionCheck {
    if (!data.segment) {
      return { name: 'minGroupSize', passed: false, message: 'No segment column', severity: 'critical' }
    }
    const groups = new Map<string | number, number>()
    for (const v of data.segment.values) {
      if (v !== null) groups.set(v, (groups.get(v) ?? 0) + 1)
    }
    const smallest = Math.min(...Array.from(groups.values()))
    const passed = smallest >= 5
    return {
      name: 'minGroupSize',
      passed,
      message: passed ? `Smallest group has ${smallest} cases` : `Smallest group has only ${smallest} cases (minimum 5 required)`,
      severity: passed ? 'info' : 'warning',
    }
  },
}

const SignificancePlugin: AnalysisPlugin = {
  id: 'kw_significance',
  title: 'Significance Testing (KW)',
  desc: 'Tests whether each variable differs significantly across segments using Kruskal-Wallis.',
  priority: 30,

  requires: ['ordinal', 'segment'],
  forbids: ['binary'],
  preconditions: [minGroupSize],

  produces: {
    description: 'Per-column significance test results with effect sizes',
    fields: { results: 'ColumnSignificance[]' },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (!data.segment) throw new Error('SignificancePlugin requires a segment column')

    const results: ColumnSignificance[] = []
    for (const col of data.columns) {
      const sig = computeSignificance(col.values, data.segment.values, col.name, col.id)
      if (sig) results.push(sig)
    }

    const charts: ChartConfig[] = []
    if (results.length > 0) {
      charts.push(buildSignificanceMap(results))
    }

    const sigCount = results.filter((r) => r.p < 0.05).length

    const findings = results
      .filter((r) => r.p < 0.05)
      .map((r) => ({
        type: 'significance',
        title: `${r.columnName} — significant difference across segments`,
        summary: `H(${r.df}) = ${r.H.toFixed(2)}, p = ${r.p < 0.001 ? '<.001' : r.p.toFixed(3)}. Effect: ε² = ${r.epsilonSquared.toFixed(3)} (${r.effectLabel}).`,
        detail: JSON.stringify(r),
        significant: true,
        pValue: r.p,
        effectSize: r.epsilonSquared,
        effectLabel: r.effectLabel,
        theme: null,
      }))

    // Check preconditions
    const assumptions = this.preconditions.map((v) => v.validate(data))

    return {
      pluginId: 'kw_significance',
      data: { results },
      charts,
      findings,
      plainLanguage: `${sigCount} of ${results.length} variables show significant differences across segments (p < .05).`,
      assumptions,
      logEntry: { type: 'analysis_run', payload: { pluginId: 'kw_significance', nTested: results.length, nSignificant: sigCount } },
    }
  },

  plainLanguage(result: PluginStepResult): string {
    const res = (result.data as { results: ColumnSignificance[] }).results
    if (!res) return 'No significance results.'
    const sigCount = res.filter((r) => r.p < 0.05).length
    return `${sigCount} of ${res.length} variables differ significantly across segments.`
  },
}

AnalysisRegistry.register(SignificancePlugin)
export { SignificancePlugin }
