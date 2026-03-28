/**
 * ModerationPlugin — tests whether the effect of X on Y depends on a moderator.
 */
import { AnalysisRegistry } from './AnalysisRegistry'
import * as StatsEngine from '../engine/stats-engine'
import type { AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract } from './types'

const ModerationPlugin: AnalysisPlugin = {
  id: 'moderation_analysis',
  title: 'Moderation analysis',
  desc: 'Tests whether the effect of a predictor on an outcome depends on a third variable.',
  priority: 77,
  reportPriority: 6,
  requires: ['continuous'],
  forbids: ['binary'],
  preconditions: [],
  produces: { description: 'Interaction effect with simple slopes and JN regions', fields: { result: 'ModerationResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 3) throw new Error('Moderation requires predictor, moderator, and outcome (3 columns)')

    const xCol = data.columns[0]
    const wCol = data.columns[1]
    const yCol = data.columns[2]

    const toNum = (v: number | string | null) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v)))
    const xRaw = xCol.values.map(toNum)
    const wRaw = wCol.values.map(toNum)
    const yRaw = yCol.values.map(toNum)

    const valid: number[] = []
    for (let i = 0; i < xRaw.length; i++) {
      if (!isNaN(xRaw[i]) && !isNaN(wRaw[i]) && !isNaN(yRaw[i])) valid.push(i)
    }
    const x = valid.map((i) => xRaw[i])
    const w = valid.map((i) => wRaw[i])
    const y = valid.map((i) => yRaw[i])

    // @ts-ignore
    const result = StatsEngine.moderation(x, w, y)
    if (result.error) throw new Error(result.error)

    const intSig = result.interactionEffect?.significant ?? false
    const lowDesc = result.simpleSlopes.lowMod.p < 0.05 ? 'significant' : 'not significant'
    const highDesc = result.simpleSlopes.highMod.p < 0.05 ? 'significant' : 'not significant'

    const findings = [{
      type: 'moderation',
      title: intSig
        ? `${wCol.name} moderates ${xCol.name} → ${yCol.name}`
        : `${wCol.name} does not moderate ${xCol.name} → ${yCol.name}`,
      summary: `Interaction p = ${result.interactionEffect.p.toFixed(3)}. R² change = ${result.rSquaredChange.toFixed(3)}.`,
      detail: JSON.stringify({ simpleSlopes: result.simpleSlopes, jnRegions: result.jnRegions }),
      significant: intSig,
      pValue: result.interactionEffect.p,
      effectSize: result.rSquaredChange,
      effectLabel: null,
      theme: null,
    }]

    return {
      pluginId: 'moderation_analysis',
      data: { result, xName: xCol.name, wName: wCol.name, yName: yCol.name },
      charts: [], findings,
      plainLanguage: this.plainLanguage({ pluginId: 'moderation_analysis', data: { result, xName: xCol.name, wName: wCol.name, yName: yCol.name }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'moderation_analysis', interactionP: result.interactionEffect.p } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const d = res.data as any
    const r = d.result
    if (!r) return 'No moderation results.'
    const intSig = r.interactionEffect?.significant ?? false
    if (intSig) {
      const lowP = r.simpleSlopes.lowMod.p < 0.05 ? 'significant' : 'not significant'
      const highP = r.simpleSlopes.highMod.p < 0.05 ? 'significant' : 'not significant'
      let jnNote = ''
      if (r.jnRegions?.hasSignificantRegion) {
        const sigRegion = r.jnRegions.regions.find((rg: any) => rg.significant)
        if (sigRegion) jnNote = ` ${sigRegion.description}.`
      }
      return `The effect of ${d.xName} on ${d.yName} depends on ${d.wName} (interaction p = ${r.interactionEffect.p.toFixed(3)}). At low ${d.wName}, the effect is ${lowP}. At high ${d.wName}, the effect is ${highP}.${jnNote}`
    }
    return `${d.wName} does not significantly moderate the relationship between ${d.xName} and ${d.yName} (interaction p = ${r.interactionEffect.p.toFixed(3)}).`
  },
}

AnalysisRegistry.register(ModerationPlugin)
export { ModerationPlugin }
