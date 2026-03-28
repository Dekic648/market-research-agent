/**
 * PostHocPlugin — pairwise Mann-Whitney comparisons with Bonferroni correction.
 *
 * Runs after SignificancePlugin on columns that were significant.
 * Produces: pairwise comparison matrix per column.
 * Charts: horizontalBar of group means with CIs.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin,
  PluginStepResult,
  ResolvedColumnData,
  OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface PairwiseResult {
  groupA: string | number
  groupB: string | number
  U: number
  z: number
  p: number
  pBonferroni: number
  r: number   // effect size
  significant: boolean
}

interface PostHocResult {
  columnId: string
  columnName: string
  pairwise: PairwiseResult[]
  groupLabels: (string | number)[]
  groupMeans: number[]
  groupSDs: number[]
  groupNs: number[]
  nComparisons: number
}

function computePostHoc(
  colValues: (number | string | null)[],
  segValues: (number | string | null)[],
  colName: string,
  colId: string
): PostHocResult | null {
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

  const groupLabels = Array.from(groups.keys()).sort((a, b) => String(a).localeCompare(String(b)))
  const groupArrays = groupLabels.map((l) => groups.get(l)!)
  const nComparisons = (groupLabels.length * (groupLabels.length - 1)) / 2

  const pairwise: PairwiseResult[] = []

  for (let i = 0; i < groupLabels.length; i++) {
    for (let j = i + 1; j < groupLabels.length; j++) {
      // @ts-ignore
      const mw = StatsEngine.mannWhitney(groupArrays[i], groupArrays[j])

      pairwise.push({
        groupA: groupLabels[i],
        groupB: groupLabels[j],
        U: mw.U,
        z: mw.z,
        p: mw.p,
        pBonferroni: Math.min(1, mw.p * nComparisons),
        r: mw.r,
        significant: mw.p * nComparisons < 0.05,
      })
    }
  }

  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length
  const sdCalc = (arr: number[]) => {
    const m = mean(arr)
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (arr.length - 1))
  }

  return {
    columnId: colId,
    columnName: colName,
    pairwise,
    groupLabels,
    groupMeans: groupArrays.map(mean),
    groupSDs: groupArrays.map((g) => g.length > 1 ? sdCalc(g) : 0),
    groupNs: groupArrays.map((g) => g.length),
    nComparisons,
  }
}

function buildMeansChart(ph: PostHocResult): ChartConfig {
  const ci95 = ph.groupMeans.map((m, i) => {
    const se = ph.groupNs[i] > 1 ? ph.groupSDs[i] / Math.sqrt(ph.groupNs[i]) : 0
    return 1.96 * se
  })

  return {
    id: `posthoc_means_${ph.columnId}_${Date.now()}`,
    type: 'horizontalBar',
    data: [{
      y: ph.groupLabels.map(String),
      x: ph.groupMeans,
      type: 'bar',
      orientation: 'h',
      marker: { color: brandColors[0] },
      error_x: {
        type: 'data',
        array: ci95,
        visible: true,
      },
      text: ph.groupMeans.map((m, i) => `${m.toFixed(2)} ±${ci95[i].toFixed(2)}`),
      textposition: 'outside',
    }],
    layout: {
      ...baseLayout,
      title: { text: `${ph.columnName} — Group Means (95% CI)` },
      xaxis: { title: { text: 'Mean' } },
      yaxis: { automargin: true },
    },
    config: baseConfig,
    stepId: 'posthoc',
    edits: {},
  }
}

const PostHocPlugin: AnalysisPlugin = {
  id: 'posthoc',
  title: 'Post-hoc Pairwise Comparisons',
  desc: 'Mann-Whitney pairwise tests with Bonferroni correction for significant KW results.',
  priority: 40,

  requires: ['ordinal', 'segment'],
  forbids: ['binary'],
  dependsOn: ['kw_significance'],
  preconditions: [],

  produces: {
    description: 'Pairwise Mann-Whitney results with Bonferroni-adjusted p-values',
    fields: { results: 'PostHocResult[]' },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (!data.segment) throw new Error('PostHocPlugin requires a segment column')

    const results: PostHocResult[] = []
    for (const col of data.columns) {
      const ph = computePostHoc(col.values, data.segment.values, col.name, col.id)
      if (ph) results.push(ph)
    }

    const charts: ChartConfig[] = []
    for (const ph of results) {
      charts.push(buildMeansChart(ph))
    }

    const findings = results.flatMap((ph) => {
      const sigPairs = ph.pairwise.filter((pw) => pw.significant)
      if (sigPairs.length === 0) return []
      return [{
        type: 'posthoc',
        title: `${ph.columnName} — ${sigPairs.length} significant pairwise difference(s)`,
        summary: sigPairs.map((pw) =>
          `"${pw.groupA}" vs "${pw.groupB}": p=${pw.pBonferroni < 0.001 ? '<.001' : pw.pBonferroni.toFixed(3)} (r=${pw.r.toFixed(3)})`
        ).join('; '),
        detail: JSON.stringify(sigPairs),
        significant: true,
        pValue: Math.min(...sigPairs.map((pw) => pw.pBonferroni)),
        effectSize: Math.max(...sigPairs.map((pw) => pw.r)),
        effectLabel: null,
        theme: null,
      }]
    })

    const totalSig = results.reduce((s, ph) => s + ph.pairwise.filter((pw) => pw.significant).length, 0)
    const totalPairs = results.reduce((s, ph) => s + ph.nComparisons, 0)

    return {
      pluginId: 'posthoc',
      data: { results },
      charts,
      findings,
      plainLanguage: `${totalSig} of ${totalPairs} pairwise comparisons significant after Bonferroni correction.`,
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'posthoc', totalPairs, totalSignificant: totalSig } },
    }
  },

  plainLanguage(result: PluginStepResult): string {
    const res = (result.data as { results: PostHocResult[] }).results
    if (!res) return 'No post-hoc results.'
    const totalSig = res.reduce((s, ph) => s + ph.pairwise.filter((pw) => pw.significant).length, 0)
    const totalPairs = res.reduce((s, ph) => s + ph.nComparisons, 0)
    return `${totalSig} of ${totalPairs} pairwise comparisons significant after Bonferroni correction.`
  },
}

AnalysisRegistry.register(PostHocPlugin)
export { PostHocPlugin }
