/**
 * ANOVAPlugin — one-way ANOVA for continuous outcomes across groups.
 *
 * Parametric alternative to KW for continuous/behavioral data.
 * Preconditions: normality (Shapiro-Wilk) + homogeneity (Levene).
 * Falls back to Welch's ANOVA for unequal variances.
 * Post-hoc: Tukey HSD.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract, AssumptionCheck,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface ANOVAResult {
  F: number
  p: number
  dfBetween: number
  dfWithin: number
  etaSquared: number
  etaLabel: string
  groupLabels: (string | number)[]
  groupMeans: number[]
  groupSDs: number[]
  groupNs: number[]
  grandMean: number
  welchUsed: boolean
  posthoc: Array<{ groupA: string | number; groupB: string | number; meanDiff: number; p: number; significant: boolean }>
  n: number
}

function labelEta(eta: number): string {
  if (eta >= 0.14) return 'large'
  if (eta >= 0.06) return 'medium'
  if (eta >= 0.01) return 'small'
  return 'negligible'
}

function buildGroupMeansChart(result: ANOVAResult, columnName: string): ChartConfig {
  return {
    id: `anova_means_${Date.now()}`,
    type: 'groupedBar',
    data: [{
      x: result.groupLabels.map(String),
      y: result.groupMeans,
      type: 'bar',
      marker: { color: brandColors[0] },
      error_y: {
        type: 'data',
        array: result.groupSDs.map((sd, i) => sd / Math.sqrt(result.groupNs[i])),
        visible: true,
      },
      text: result.groupMeans.map((m) => m.toFixed(2)),
      textposition: 'outside',
    }],
    layout: {
      ...baseLayout,
      title: { text: `${columnName} by Group (± SE)` },
      yaxis: { title: { text: columnName } },
      xaxis: { title: { text: 'Group' } },
    },
    config: baseConfig,
    stepId: 'anova_oneway',
    edits: {},
  }
}

const ANOVAPlugin: AnalysisPlugin = {
  id: 'anova_oneway',
  title: 'One-way ANOVA',
  desc: 'Parametric group comparison for continuous outcomes with normality checks.',
  priority: 55,
  reportPriority: 3,
  requires: ['continuous', 'segment'],
  preconditions: [],
  produces: {
    description: 'F statistic, eta-squared, group means, Tukey HSD post-hoc',
    fields: { result: 'ANOVAResult' },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (!data.segment) throw new Error('ANOVA requires a segment column')
    if (data.columns.length === 0) throw new Error('ANOVA requires at least one column')

    const col = data.columns[0]
    const assumptions: AssumptionCheck[] = []

    // Group data by segment
    const groupMap = new Map<string | number, number[]>()
    for (let i = 0; i < col.values.length; i++) {
      const seg = data.segment.values[i]
      const val = col.values[i]
      if (seg === null || val === null) continue
      const n = typeof val === 'number' ? val : parseFloat(String(val))
      if (isNaN(n)) continue
      if (!groupMap.has(seg)) groupMap.set(seg, [])
      groupMap.get(seg)!.push(n)
    }

    const groupLabels = Array.from(groupMap.keys())
    const groups = groupLabels.map((l) => groupMap.get(l)!)

    // Precondition: minimum group size
    const minSize = Math.min(...groups.map((g) => g.length))
    if (minSize < 5) {
      assumptions.push({
        name: 'minGroupSize(5)',
        passed: false,
        message: `Smallest group has only ${minSize} observations. Need at least 5.`,
        severity: 'critical',
      })
      throw new Error(`Group too small: ${minSize} < 5`)
    }

    // Precondition: normality check (Shapiro-Wilk per group)
    const totalN = groups.reduce((s, g) => s + g.length, 0)
    let normalityViolation = false
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].length >= 3 && groups[i].length <= 5000) {
        // @ts-ignore
        const sw = StatsEngine.shapiroWilk(groups[i]) as any
        if (sw.p < 0.05) {
          normalityViolation = true
          if (totalN < 50) {
            assumptions.push({
              name: 'shapiroWilk',
              passed: false,
              message: `Group "${groupLabels[i]}" is not normally distributed (p = ${sw.p.toFixed(3)}). With n < 50, consider Kruskal-Wallis instead.`,
              severity: 'warning',
            })
          }
        }
      }
    }

    if (normalityViolation && totalN < 50) {
      assumptions.push({
        name: 'normalityBlock',
        passed: false,
        message: 'Non-normal groups detected with small sample. Kruskal-Wallis (non-parametric) is more appropriate.',
        severity: 'critical',
      })
      throw new Error('Normality violated with small sample — use KW instead')
    }

    if (normalityViolation && totalN >= 50) {
      assumptions.push({
        name: 'shapiroWilk',
        passed: true,
        message: 'Some groups are non-normal, but large sample (n ≥ 50) — ANOVA is robust (CLT applies).',
        severity: 'info',
      })
    }

    // Precondition: Levene's test for homogeneity of variance
    // @ts-ignore
    const leveneResult = StatsEngine.levene(groups) as any
    const unequalVariances = leveneResult.p < 0.05
    let welchUsed = false

    if (unequalVariances) {
      assumptions.push({
        name: 'leveneTest',
        passed: false,
        message: `Levene's test significant (p = ${leveneResult.p.toFixed(3)}) — variances are unequal. Welch's ANOVA used.`,
        severity: 'warning',
      })
      welchUsed = true
    }

    // Run ANOVA (standard or Welch)
    let anovaResult: any
    if (welchUsed) {
      // @ts-ignore
      anovaResult = StatsEngine.welchAnova(groups)
    } else {
      // @ts-ignore
      anovaResult = StatsEngine.anova(groups)
    }
    if (anovaResult.error) throw new Error(anovaResult.error)

    // Post-hoc: Tukey HSD
    // @ts-ignore
    const tukeyResults = StatsEngine.tukeyHSD(groups) as Array<{
      groupA: number; groupB: number; meanDiff: number; se: number; q: number; p: number; significant: boolean
    }>

    const posthoc = tukeyResults.map((t) => ({
      groupA: groupLabels[t.groupA],
      groupB: groupLabels[t.groupB],
      meanDiff: t.meanDiff,
      p: t.p,
      significant: t.significant,
    }))

    const etaSq = anovaResult.etaSquared ?? 0
    const groupMeans = groups.map((g) => g.reduce((s, v) => s + v, 0) / g.length)
    const groupSDs = groups.map((g) => {
      const m = g.reduce((s, v) => s + v, 0) / g.length
      return Math.sqrt(g.reduce((s, v) => s + (v - m) ** 2, 0) / (g.length - 1 || 1))
    })

    const result: ANOVAResult = {
      F: anovaResult.F,
      p: anovaResult.p,
      dfBetween: anovaResult.dfBetween ?? groups.length - 1,
      dfWithin: anovaResult.dfWithin ?? totalN - groups.length,
      etaSquared: etaSq,
      etaLabel: labelEta(etaSq),
      groupLabels,
      groupMeans,
      groupSDs,
      groupNs: groups.map((g) => g.length),
      grandMean: anovaResult.grandMean ?? 0,
      welchUsed,
      posthoc,
      n: totalN,
    }

    const charts = [buildGroupMeansChart(result, col.name)]
    const sigPairs = posthoc.filter((p) => p.significant)

    const highGroupIdx = groupMeans.indexOf(Math.max(...groupMeans))
    const lowGroupIdx = groupMeans.indexOf(Math.min(...groupMeans))

    const findings = [{
      type: 'anova',
      title: `F(${result.dfBetween}, ${result.dfWithin}) = ${result.F.toFixed(2)}, p ${result.p < 0.001 ? '< .001' : '= ' + result.p.toFixed(3)} — ${result.etaLabel} effect`,
      summary: `One-way ANOVA shows ${col.name} ${result.p < 0.05 ? 'differs significantly' : 'does not differ significantly'} across ${groupLabels.length} groups (η² = ${etaSq.toFixed(3)} — ${result.etaLabel} effect).${welchUsed ? " Welch's correction applied — variances unequal." : ''}${sigPairs.length > 0 ? ` ${sigPairs.length} significant pairwise difference(s).` : ''}`,
      summaryLanguage: result.p < 0.05
        ? `There IS a clear difference in ${col.name} across groups — ${groupLabels[highGroupIdx]} scores highest, ${groupLabels[lowGroupIdx]} lowest. ${result.p < 0.001 ? 'Extremely unlikely to be random.' : 'Unlikely to be random.'}`
        : `There is NO meaningful difference in ${col.name} across groups. The differences could easily be random.`,
      detail: JSON.stringify({ posthoc, groupMeans, groupLabels }),
      significant: result.p < 0.05,
      pValue: result.p,
      effectSize: etaSq,
      effectLabel: result.etaLabel,
      theme: null,
    }]

    return {
      pluginId: 'anova_oneway',
      data: { result, columnName: col.name },
      charts,
      findings,
      plainLanguage: this.plainLanguage({
        pluginId: 'anova_oneway', data: { result, columnName: col.name },
        charts: [], findings: [], plainLanguage: '', assumptions, logEntry: {},
      }),
      assumptions,
      logEntry: { type: 'analysis_run', payload: { pluginId: 'anova_oneway', F: result.F, p: result.p, etaSquared: etaSq } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: ANOVAResult; columnName: string }).result
    const colName = (res.data as any).columnName ?? 'the outcome'
    if (!r) return 'No ANOVA results.'

    let text = `One-way ANOVA shows ${colName} ${r.p < 0.05 ? 'differs significantly' : 'does not differ significantly'} across ${r.groupLabels.length} groups (F(${r.dfBetween}, ${r.dfWithin}) = ${r.F.toFixed(2)}, p ${r.p < 0.001 ? '< .001' : '= ' + r.p.toFixed(3)}, η² = ${r.etaSquared.toFixed(3)} — ${r.etaLabel} effect).`

    if (r.welchUsed) text += " Welch's ANOVA used due to unequal group variances."

    const sigPairs = r.posthoc.filter((p) => p.significant)
    if (sigPairs.length > 0) {
      const top = sigPairs[0]
      text += ` Largest difference: ${top.groupA} vs ${top.groupB} (diff = ${top.meanDiff.toFixed(2)}, p ${top.p < 0.001 ? '< .001' : '= ' + top.p.toFixed(3)}).`
    }

    return text
  },
}

AnalysisRegistry.register(ANOVAPlugin)
export { ANOVAPlugin }
