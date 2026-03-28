/**
 * MediationPlugin — tests whether a third variable explains the relationship.
 */
import { AnalysisRegistry } from './AnalysisRegistry'
import * as StatsEngine from '../engine/stats-engine'
import type { AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract } from './types'

const MediationPlugin: AnalysisPlugin = {
  id: 'mediation',
  title: 'Mediation analysis',
  desc: 'Tests whether a third variable explains the relationship between predictor and outcome.',
  priority: 76,
  reportPriority: 6,
  requires: ['continuous'],
  forbids: ['binary'],
  preconditions: [],
  produces: { description: 'Mediation paths with bootstrap CI', fields: { result: 'MediationResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 3) throw new Error('Mediation requires predictor, mediator, and outcome (3 columns)')

    const xCol = data.columns[0]
    const mCol = data.columns[1]
    const yCol = data.columns[2]

    const toNum = (v: number | string | null) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v)))
    const xRaw = xCol.values.map(toNum)
    const mRaw = mCol.values.map(toNum)
    const yRaw = yCol.values.map(toNum)

    // Complete cases
    const valid: number[] = []
    for (let i = 0; i < xRaw.length; i++) {
      if (!isNaN(xRaw[i]) && !isNaN(mRaw[i]) && !isNaN(yRaw[i])) valid.push(i)
    }
    const x = valid.map((i) => xRaw[i])
    const m = valid.map((i) => mRaw[i])
    const y = valid.map((i) => yRaw[i])

    // @ts-ignore
    const result = StatsEngine.mediation(x, m, y)
    if (result.error) throw new Error(result.error)

    const ciExcludesZero = result.bootstrapCI && !isNaN(result.bootstrapCI.lower) && !isNaN(result.bootstrapCI.upper)
      ? (result.bootstrapCI.lower > 0 || result.bootstrapCI.upper < 0) : false
    const propMediated = result.proportionMediated ?? 0
    const indirectEff = result.indirectEffect ?? 0
    const sobelP = result.sobelP ?? 1
    const propPct = Math.abs(propMediated * 100)

    const findings = [{
      type: 'mediation',
      title: ciExcludesZero
        ? `${mCol.name} mediates ${xCol.name} → ${yCol.name} (${propPct.toFixed(0)}%)`
        : `${mCol.name} does not mediate ${xCol.name} → ${yCol.name}`,
      summary: `Indirect effect = ${indirectEff.toFixed(3)}. Bootstrap 95% CI: [${result.bootstrapCI?.lower?.toFixed(3) ?? '?'}, ${result.bootstrapCI?.upper?.toFixed(3) ?? '?'}]. Sobel p = ${sobelP.toFixed(3)}.`,
      detail: JSON.stringify({ pathA: result.pathA, pathB: result.pathB, pathC: result.pathC, pathCprime: result.pathCprime }),
      significant: ciExcludesZero,
      pValue: sobelP as number | null,
      effectSize: Math.abs(propMediated),
      effectLabel: null,
      theme: null,
    }]

    return {
      pluginId: 'mediation',
      data: { result, xName: xCol.name, mName: mCol.name, yName: yCol.name },
      charts: [], findings,
      plainLanguage: this.plainLanguage({ pluginId: 'mediation', data: { result, xName: xCol.name, mName: mCol.name, yName: yCol.name }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'mediation', indirectEffect: result.indirectEffect, sobelP: result.sobelP } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const d = res.data as any
    const r = d.result
    if (!r) return 'No mediation results.'
    const ciExcludesZero = r.bootstrapCI && !isNaN(r.bootstrapCI.lower) && !isNaN(r.bootstrapCI.upper)
      ? (r.bootstrapCI.lower > 0 || r.bootstrapCI.upper < 0) : false
    const propPct = Math.abs(r.proportionMediated * 100)
    if (ciExcludesZero) {
      return `${d.mName} partially explains why ${d.xName} affects ${d.yName}. The indirect effect through ${d.mName} accounts for ${propPct.toFixed(0)}% of the total effect (indirect effect = ${r.indirectEffect.toFixed(3)}, 95% CI = ${r.bootstrapCI.lower.toFixed(3)} to ${r.bootstrapCI.upper.toFixed(3)}).`
    }
    return `${d.mName} does not significantly mediate the relationship between ${d.xName} and ${d.yName} (indirect effect = ${r.indirectEffect.toFixed(3)}, 95% CI = ${r.bootstrapCI?.lower?.toFixed(3) ?? '?'} to ${r.bootstrapCI?.upper?.toFixed(3) ?? '?'}).`
  },
}

AnalysisRegistry.register(MediationPlugin)
export { MediationPlugin }
