/**
 * PostHocPlugin — pairwise Mann-Whitney comparisons with Bonferroni correction.
 *
 * Runs after SignificancePlugin on columns that were significant.
 * Produces: pairwise comparison matrix per column.
 * Charts: horizontalBar of group means with CIs.
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
  const yFull = ph.groupLabels.map(String)

  return {
    id: `posthoc_means_${ph.columnId}_${Date.now()}`,
    type: 'horizontalBar',
    data: [{
      y: yFull.map((l) => truncateLabel(l, 40)),
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
      customdata: yFull,
      hovertemplate: '%{customdata}: %{x:.2f}<extra></extra>',
    }],
    layout: {
      ...baseLayout,
      title: { text: `${truncateLabel(ph.columnName, 50)} — Group Means (95% CI)` },
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
  desc: 'Which specific segments differ from each other?',
  priority: 40,
  reportPriority: 3,

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
      const widestPair = sigPairs.reduce((best, pw) => {
        const idxA = ph.groupLabels.indexOf(pw.groupA)
        const idxB = ph.groupLabels.indexOf(pw.groupB)
        const gap = Math.abs((idxA >= 0 ? ph.groupMeans[idxA] : 0) - (idxB >= 0 ? ph.groupMeans[idxB] : 0))
        return gap > best.gap ? { pw, gap } : best
      }, { pw: sigPairs[0], gap: 0 })
      const summaryLanguage = `${widestPair.pw.groupA} and ${widestPair.pw.groupB} differ the most on ${ph.columnName} — ${widestPair.gap.toFixed(1)}-point gap.`

      return [{
        type: 'posthoc',
        title: `${ph.columnName} — ${sigPairs.length} significant pairwise difference(s)`,
        summary: sigPairs.map((pw) =>
          `"${pw.groupA}" vs "${pw.groupB}": p=${pw.pBonferroni < 0.001 ? '<.001' : pw.pBonferroni.toFixed(3)} (r=${pw.r.toFixed(3)})`
        ).join('; '),
        summaryLanguage,
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

    // Build pairwise comparison tables
    const tables: ResultTable[] = results.map((ph) => ({
      id: `posthoc_table_${ph.columnId}_${Date.now()}`,
      title: `${ph.columnName} — Pairwise Comparisons`,
      columns: [
        { key: 'pair', label: 'Pair' },
        { key: 'meanA', label: 'Mean A', numeric: true },
        { key: 'meanB', label: 'Mean B', numeric: true },
        { key: 'diff', label: 'Diff', numeric: true },
        { key: 'pValue', label: 'p-value', numeric: true },
        { key: 'correctedP', label: 'Corrected p', numeric: true },
        { key: 'significant', label: 'Significant?' },
      ],
      rows: ph.pairwise.map((pw) => {
        const idxA = ph.groupLabels.indexOf(pw.groupA)
        const idxB = ph.groupLabels.indexOf(pw.groupB)
        const meanA = idxA >= 0 ? ph.groupMeans[idxA] : 0
        const meanB = idxB >= 0 ? ph.groupMeans[idxB] : 0
        return {
          pair: `${pw.groupA} vs ${pw.groupB}`,
          meanA: Math.round(meanA * 100) / 100,
          meanB: Math.round(meanB * 100) / 100,
          diff: Math.round((meanA - meanB) * 100) / 100,
          pValue: Math.round(pw.p * 10000) / 10000,
          correctedP: Math.round(pw.pBonferroni * 10000) / 10000,
          significant: pw.significant ? 'Yes' : 'No',
        }
      }),
    }))

    // Interpretation card
    const interpretationCard = totalSig > 0
      ? `At least ${totalSig} pair${totalSig > 1 ? 's' : ''} of segments differ${totalSig > 1 ? '' : 's'} significantly after correcting for multiple comparisons.`
      : `No pairwise comparisons reached significance after correction — the overall group difference may be driven by small shifts across all segments rather than any single pair.`

    return {
      pluginId: 'posthoc',
      data: { results },
      charts,
      findings,
      tables,
      interpretationCard,
      plainLanguage: this.plainLanguage({ pluginId: 'posthoc', data: { results }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'posthoc', totalPairs, totalSignificant: totalSig } },
    }
  },

  plainLanguage(result: PluginStepResult): string {
    const res = (result.data as { results: PostHocResult[] }).results
    if (!res || res.length === 0) return 'No post-hoc results.'
    // Find the most significant pairwise comparison
    let best: { colName: string; groupA: string | number; groupB: string | number; p: number; meanA: number; meanB: number } | null = null
    for (const ph of res) {
      const highMeanIdx = ph.groupMeans.indexOf(Math.max(...ph.groupMeans))
      const lowMeanIdx = ph.groupMeans.indexOf(Math.min(...ph.groupMeans))
      for (const pw of ph.pairwise) {
        if (pw.significant && (!best || pw.pBonferroni < best.p)) {
          const idxA = ph.groupLabels.indexOf(pw.groupA)
          const idxB = ph.groupLabels.indexOf(pw.groupB)
          best = {
            colName: ph.columnName,
            groupA: pw.groupA, groupB: pw.groupB, p: pw.pBonferroni,
            meanA: idxA >= 0 ? ph.groupMeans[idxA] : 0,
            meanB: idxB >= 0 ? ph.groupMeans[idxB] : 0,
          }
        }
      }
    }
    if (best) {
      const higher = best.meanA >= best.meanB ? best.groupA : best.groupB
      const lower = best.meanA >= best.meanB ? best.groupB : best.groupA
      return `"${higher}" and "${lower}" differ most on ${best.colName} after correcting for multiple comparisons (p ${best.p < 0.001 ? '< .001' : '= ' + best.p.toFixed(3)}). "${higher}" scores higher.`
    }
    const totalPairs = res.reduce((s, ph) => s + ph.nComparisons, 0)
    return `No pairwise comparisons were significant after Bonferroni correction (${totalPairs} comparisons tested).`
  },
}

AnalysisRegistry.register(PostHocPlugin)
export { PostHocPlugin }
