/**
 * SignificancePlugin — Kruskal-Wallis / ANOVA by segment.
 *
 * Tests whether each column differs significantly across segments.
 * Produces: H-statistic, p-value, epsilon-squared effect size per column.
 * Charts: significanceMap.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors, truncateLabel } from '../engine/chartDefaults'
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
  groupSDs: number[]
  groupNs: number[]
  /** t-test fields (only when exactly 2 groups) */
  cohensD?: number
  ci95?: { lower: number; upper: number }
  meanDiff?: number
}

function effectLabel(eps: number): string {
  if (eps < 0.01) return 'negligible'
  if (eps < 0.06) return 'small'
  if (eps < 0.14) return 'medium'
  return 'large'
}

function cohensDLabel(d: number): string {
  const abs = Math.abs(d)
  if (abs < 0.2) return 'negligible'
  if (abs < 0.5) return 'small'
  if (abs < 0.8) return 'moderate'
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

  const groupMeans = groupArrays.map((g) => g.reduce((s, v) => s + v, 0) / g.length)
  const groupSDs = groupArrays.map((g) => {
    const m = g.reduce((s, v) => s + v, 0) / g.length
    return g.length > 1 ? Math.sqrt(g.reduce((s, v) => s + (v - m) ** 2, 0) / (g.length - 1)) : 0
  })
  const groupNs = groupArrays.map((g) => g.length)

  // Exactly 2 groups → use Welch's t-test (more powerful, produces CI + Cohen's d)
  if (groups.size === 2) {
    // @ts-ignore
    const tt = StatsEngine.ttest(groupArrays[0], groupArrays[1]) as any
    return {
      columnId: colId,
      columnName: colName,
      testUsed: "Welch's t-test",
      H: 0, // not applicable for t-test
      p: tt.p,
      df: tt.df,
      epsilonSquared: 0, // not applicable
      effectLabel: cohensDLabel(tt.cohensD ?? 0),
      nPerGroup: groupNs,
      groupMeans,
      groupSDs,
      groupNs,
      cohensD: tt.cohensD,
      ci95: tt.ci95,
      meanDiff: tt.meanDiff,
    }
  }

  // 3+ groups → Kruskal-Wallis
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
    nPerGroup: groupNs,
    groupMeans,
    groupSDs,
    groupNs,
  }
}

function buildSignificanceMap(results: ColumnSignificance[]): ChartConfig {
  const sorted = [...results].sort((a, b) => a.p - b.p)
  const negLogP = sorted.map((r) => -Math.log10(Math.max(r.p, 1e-300)))
  const threshold = -Math.log10(0.05)
  const yDisplay = sorted.map((r) => truncateLabel(r.columnName, 50))
  const yFull = sorted.map((r) => r.columnName)

  return {
    id: `significance_map_${Date.now()}`,
    type: 'significanceMap',
    data: [
      {
        y: yDisplay,
        x: negLogP,
        type: 'bar',
        orientation: 'h',
        marker: {
          color: sorted.map((r) => r.p < 0.05 ? brandColors[0] : '#b4b2a9'),
        },
        text: sorted.map((r) => `p=${r.p < 0.001 ? '<.001' : r.p.toFixed(3)}`),
        textposition: 'outside',
        customdata: yFull,
        hovertemplate: '%{customdata}<br>p = %{text}<extra></extra>',
      },
      {
        x: [threshold, threshold],
        y: [yDisplay[0] ?? '', yDisplay[yDisplay.length - 1] ?? ''],
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
  desc: 'Are the differences between segments real, or could they be random?',
  priority: 30,
  reportPriority: 3,

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

    // Compute group labels for summaryLanguage
    const segGroups = new Map<string | number, true>()
    for (const v of data.segment.values) {
      if (v !== null) segGroups.set(v, true)
    }

    const groupLabelsAll = Array.from(segGroups.keys()).sort((a, b) => String(a).localeCompare(String(b)))

    const findings = results.map((r) => {
      const maxMeanIdx = r.groupMeans.indexOf(Math.max(...r.groupMeans))
      const minMeanIdx = r.groupMeans.indexOf(Math.min(...r.groupMeans))
      const highGroup = groupLabelsAll[maxMeanIdx] ?? 'highest group'
      const lowGroup = groupLabelsAll[minMeanIdx] ?? 'lowest group'
      const isSig = r.p < 0.05
      const isTTest = r.testUsed === "Welch's t-test"

      let summaryLanguage: string
      let summary: string

      if (isTTest) {
        const ciStr = r.ci95 ? `, 95% CI [${r.ci95.lower.toFixed(2)}–${r.ci95.upper.toFixed(2)}]` : ''
        summaryLanguage = isSig
          ? `${highGroup} rates ${r.columnName} significantly higher than ${lowGroup} (mean ${r.groupMeans[maxMeanIdx].toFixed(2)} vs ${r.groupMeans[minMeanIdx].toFixed(2)}, d = ${(r.cohensD ?? 0).toFixed(2)}${ciStr}).`
          : `There is NO meaningful difference in ${r.columnName} between ${highGroup} and ${lowGroup}.`
        summary = `t(${r.df.toFixed(1)}) = ${(r.meanDiff ?? 0 / 1).toFixed(2)}, p = ${r.p < 0.001 ? '<.001' : r.p.toFixed(3)}. Cohen's d = ${(r.cohensD ?? 0).toFixed(3)} (${r.effectLabel})${ciStr}.`
      } else {
        summaryLanguage = isSig
          ? `There IS a clear difference between ${data.segment!.name} segments on ${r.columnName} — ${highGroup} scores highest, ${lowGroup} lowest. ${r.p < 0.001 ? 'Extremely unlikely to be random chance.' : r.p < 0.01 ? 'Very unlikely to be random.' : 'Unlikely to be random.'}`
          : `There is NO meaningful difference in ${r.columnName} across ${data.segment!.name} segments. The differences could easily be random.`
        summary = `H(${r.df}) = ${r.H.toFixed(2)}, p = ${r.p < 0.001 ? '<.001' : r.p.toFixed(3)}. Effect: ε² = ${r.epsilonSquared.toFixed(3)} (${r.effectLabel}).`
      }

      // Relative likelihood: for significant Likert findings, compute T2B per segment
      let relativeLikelihood: { multiplier: number; highPct: number; lowPct: number; highLabel: string; lowLabel: string } | null = null
      if (isSig) {
        const col = data.columns.find((c) => c.id === r.columnId)
        if (col) {
          // Check if column is ordinal/Likert (all numeric with reasonable range)
          const numericVals = col.values.filter((v): v is number => typeof v === 'number' || (v !== null && !isNaN(Number(v))))
          const uniqueVals = new Set(numericVals.map(Number))
          const isLikert = uniqueVals.size >= 3 && uniqueVals.size <= 10

          if (isLikert) {
            const sortedScale = Array.from(uniqueVals).sort((a, b) => a - b)
            const scaleMax = sortedScale[sortedScale.length - 1]
            const topThreshold = sortedScale.length <= 3 ? scaleMax : scaleMax - 1

            // Group by segment, compute T2B per group
            const segGrouped = new Map<string | number, { top: number; total: number }>()
            for (let i = 0; i < col.values.length; i++) {
              const seg = data.segment!.values[i]
              const val = col.values[i]
              if (seg === null || val === null) continue
              const numVal = typeof val === 'number' ? val : Number(val)
              if (isNaN(numVal)) continue
              if (!segGrouped.has(seg)) segGrouped.set(seg, { top: 0, total: 0 })
              const g = segGrouped.get(seg)!
              g.total++
              if (numVal >= topThreshold) g.top++
            }

            const highSeg = segGrouped.get(groupLabelsAll[maxMeanIdx])
            const lowSeg = segGrouped.get(groupLabelsAll[minMeanIdx])

            if (highSeg && lowSeg && highSeg.total > 0 && lowSeg.total > 0) {
              // @ts-ignore
              const zpResult = StatsEngine.twoProportionZ(highSeg.top, highSeg.total, lowSeg.top, lowSeg.total) as any
              if (zpResult.p < 0.05 && zpResult.p2 > 0) {
                const mult = zpResult.p1 / zpResult.p2
                relativeLikelihood = {
                  multiplier: Math.round(mult * 10) / 10,
                  highPct: Math.round(zpResult.p1 * 100),
                  lowPct: Math.round(zpResult.p2 * 100),
                  highLabel: String(highGroup),
                  lowLabel: String(lowGroup),
                }
                summary += ` ${highGroup} is ${relativeLikelihood.multiplier.toFixed(1)}x more likely to rate positively than ${lowGroup} (${relativeLikelihood.highPct}% vs ${relativeLikelihood.lowPct}%).`
              }
            }
          }
        }
      }

      const detailWithLabels = { ...r, groupLabels: groupLabelsAll.map(String), relativeLikelihood }
      const effectSizeVal = isTTest ? Math.abs(r.cohensD ?? 0) : r.epsilonSquared

      return {
        type: 'significance',
        title: isSig
          ? `${r.columnName} — significant difference across segments`
          : `${r.columnName} — no significant difference`,
        summary,
        summaryLanguage,
        detail: JSON.stringify(detailWithLabels),
        significant: isSig,
        pValue: r.p,
        effectSize: effectSizeVal,
        effectLabel: r.effectLabel,
        theme: null,
      }
    })

    // Check preconditions
    const assumptions = this.preconditions.map((v) => v.validate(data))

    // Add mean-by-segment bar charts with 95% CI for significant results
    for (const r of results.filter((r) => r.p < 0.05)) {
      const ci95 = r.groupMeans.map((m, i) => {
        const n = r.groupNs[i] ?? 1
        const sd = r.groupSDs?.[i] ?? 0
        return n > 1 ? 1.96 * sd / Math.sqrt(n) : 0
      })
      charts.push({
        id: `kw_means_${r.columnId}_${Date.now()}`,
        type: 'horizontalBar',
        data: [{
          y: groupLabelsAll.map((l) => truncateLabel(String(l), 40)),
          x: r.groupMeans,
          type: 'bar',
          orientation: 'h',
          marker: { color: brandColors.slice(0, groupLabelsAll.length) },
          error_x: { type: 'data', array: ci95, visible: true },
          text: r.groupMeans.map((m) => m.toFixed(2)),
          textposition: 'outside',
          customdata: groupLabelsAll.map(String),
          hovertemplate: '%{customdata}: %{x:.2f}<extra></extra>',
        }],
        layout: {
          ...baseLayout,
          title: { text: `${truncateLabel(r.columnName, 45)} — Mean by ${truncateLabel(data.segment!.name, 25)} (95% CI)` },
          xaxis: { title: { text: 'Mean' } },
          yaxis: { automargin: true },
        },
        config: baseConfig,
        stepId: 'kw_significance',
        edits: {},
      })
    }

    // Interpretation card
    const interpretationCard = sigCount > 0
      ? `There IS a significant difference on ${sigCount} of ${results.length} items across ${data.segment!.name} segments. ${sigCount === results.length ? 'All items differ.' : `${results.length - sigCount} item(s) show no difference.`}`
      : `There is NO significant difference on any of the ${results.length} items across ${data.segment!.name} segments. The differences could easily be random.`

    return {
      pluginId: 'kw_significance',
      data: { results, segmentName: data.segment.name },
      charts,
      findings,
      interpretationCard,
      plainLanguage: this.plainLanguage({ pluginId: 'kw_significance', data: { results, segmentName: data.segment.name }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions,
      logEntry: { type: 'analysis_run', payload: { pluginId: 'kw_significance', nTested: results.length, nSignificant: sigCount } },
    }
  },

  plainLanguage(result: PluginStepResult): string {
    const d = result.data as { results: ColumnSignificance[]; segmentName?: string }
    const res = d.results
    if (!res || res.length === 0) return 'No significance results.'
    const segName = d.segmentName ?? 'segment'
    const sig = res.filter((r) => r.p < 0.05).sort((a, b) => a.p - b.p)
    if (sig.length === 0) {
      return `None of the ${res.length} variables show significant differences across ${segName} groups.`
    }
    const top = sig[0]
    return `${top.columnName} scores differ most strongly across ${segName} groups (p ${top.p < 0.001 ? '< .001' : '= ' + top.p.toFixed(3)}, ${top.effectLabel} effect). ${sig.length} of ${res.length} variables show significant differences overall.`
  },
}

AnalysisRegistry.register(SignificancePlugin)
export { SignificancePlugin }
