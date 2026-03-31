/**
 * ABTestPlugin — lightweight A/B test for binary segment × numeric outcome.
 *
 * Wraps abTest() from the engine which internally runs Welch's t-test
 * and adds lift + power calculations.
 *
 * De-duplication: suppressed if kw_significance already tested the same
 * column × segment pair (which now uses ttest for 2-group comparisons).
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'

function cohensDLabel(d: number): string {
  const abs = Math.abs(d)
  if (abs < 0.2) return 'negligible'
  if (abs < 0.5) return 'small'
  if (abs < 0.8) return 'moderate'
  return 'large'
}

const ABTestPlugin: AnalysisPlugin = {
  id: 'abtest',
  title: 'A/B Test',
  desc: 'Compare two groups on a numeric outcome with lift and power.',
  priority: 35,
  reportPriority: 3,
  requires: ['ordinal', 'segment'],
  preconditions: [],
  produces: {
    description: 'A/B test with lift, Cohen\'s d, and recommended N',
    fields: { results: 'ABTestResult[]' },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (!data.segment) throw new Error('ABTestPlugin requires a segment column')

    // Only fire for exactly 2 segment groups
    const segValues = data.segment.values.filter((v) => v !== null)
    const uniqueSegs = Array.from(new Set(segValues))
    if (uniqueSegs.length !== 2) {
      return {
        pluginId: 'abtest', data: {}, charts: [], findings: [],
        plainLanguage: 'A/B test requires exactly 2 groups.',
        assumptions: [], logEntry: {},
      }
    }

    const segA = String(uniqueSegs[0])
    const segB = String(uniqueSegs[1])
    const findings: Array<Record<string, unknown>> = []

    for (const col of data.columns) {
      // Group values by segment
      const groupA: number[] = []
      const groupB: number[] = []

      for (let i = 0; i < col.values.length; i++) {
        const seg = data.segment.values[i]
        const val = col.values[i]
        if (seg === null || val === null) continue
        const num = typeof val === 'number' ? val : parseFloat(String(val))
        if (isNaN(num)) continue
        if (String(seg) === segA) groupA.push(num)
        else if (String(seg) === segB) groupB.push(num)
      }

      if (groupA.length < 5 || groupB.length < 5) continue

      // @ts-ignore
      const result = StatsEngine.abTest(groupA, groupB, 'continuous') as any
      if (result.error) continue

      const meanA = result.controlSummary?.mean ?? 0
      const meanB = result.variantSummary?.mean ?? 0
      const higher = meanA >= meanB ? segA : segB
      const lower = meanA >= meanB ? segB : segA
      const highMean = Math.max(meanA, meanB)
      const lowMean = Math.min(meanA, meanB)
      const isSig = result.p < 0.05
      const d = Math.abs(result.cohensD ?? 0)
      const lift = result.lift ?? 0

      findings.push({
        type: 'abtest',
        title: `${segA} vs ${segB} — ${col.name}`,
        summary: `t(${result.df?.toFixed(1) ?? '?'}) = ${result.t?.toFixed(2) ?? '?'}, p = ${result.p < 0.001 ? '<.001' : result.p.toFixed(3)}. Cohen's d = ${d.toFixed(2)} (${cohensDLabel(d)}). Lift: ${lift.toFixed(1)}%.`,
        summaryLanguage: isSig
          ? `${higher} scores ${col.name} higher than ${lower} (${highMean.toFixed(2)} vs ${lowMean.toFixed(2)}) — a ${cohensDLabel(d)} difference (p = ${result.p < 0.001 ? '<.001' : result.p.toFixed(3)}).`
          : `No meaningful difference on ${col.name} between ${segA} and ${segB}.`,
        detail: JSON.stringify({
          segA, segB, meanA, meanB, lift,
          cohensD: result.cohensD, p: result.p,
          ci95: result.ci95, power: result.power,
          recommendedN: result.recommendedN,
        }),
        significant: isSig,
        pValue: result.p,
        effectSize: d,
        effectLabel: cohensDLabel(d),
        theme: null,
      })
    }

    return {
      pluginId: 'abtest',
      data: { segA, segB },
      charts: [],
      findings: findings as any,
      plainLanguage: findings.length > 0
        ? `A/B comparison between ${segA} and ${segB} across ${findings.length} variable(s).`
        : 'No A/B comparisons produced.',
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'abtest', nComparisons: findings.length } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    return 'A/B test results.'
  },
}

AnalysisRegistry.register(ABTestPlugin)
export { ABTestPlugin }
