/**
 * PowerAnalysisPlugin — sample size and power calculator.
 * Meta-plugin: UI-driven, no data required.
 * Not run by HeadlessRunner — manual only.
 */
import { AnalysisRegistry } from './AnalysisRegistry'
import * as StatsEngine from '../engine/stats-engine'
import type { AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract } from './types'

type TestType = 'ttest' | 'anova' | 'correlation' | 'chisq'

const PowerAnalysisPlugin: AnalysisPlugin = {
  id: 'power_analysis',
  title: 'Sample size & power calculator',
  desc: 'Calculate required sample size or achieved statistical power for your study design.',
  priority: 99,
  reportPriority: 1,
  requires: [],
  forbids: [],
  preconditions: [],
  produces: { description: 'Power analysis results', fields: { result: 'PowerResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    // This plugin is parameter-driven. Extract params from data.
    const params = (data as any).powerParams ?? {}
    const testType: TestType = params.testType ?? 'ttest'

    let result: any
    switch (testType) {
      case 'ttest':
        // @ts-ignore
        result = StatsEngine.powerTTest(params)
        break
      case 'anova':
        // @ts-ignore
        result = StatsEngine.powerANOVA(params)
        break
      case 'correlation':
        // @ts-ignore
        result = StatsEngine.powerCorrelation(params)
        break
      case 'chisq':
        // @ts-ignore
        result = StatsEngine.powerChiSq(params)
        break
      default:
        throw new Error(`Unknown test type: ${testType}`)
    }

    const findings = [{
      type: 'power_analysis',
      title: result.requiredN !== null
        ? `Required n = ${result.requiredN} per group`
        : `Achieved power = ${(result.achievedPower * 100).toFixed(1)}%`,
      summary: result.interpretation,
      summaryLanguage: result.requiredN !== null
        ? `You need ${result.requiredN} respondents to detect a ${result.effectSizeLabel ?? 'medium'} effect with ${((result.power ?? 0.8) * 100).toFixed(0)}% power.`
        : `With ${result.n ?? 'the current'} respondents, this study has ${(result.achievedPower * 100).toFixed(0)}% power to detect a ${result.effectSizeLabel ?? 'medium'} effect.`,
      detail: JSON.stringify(result),
      significant: false,
      pValue: null,
      effectSize: result.effectSize,
      effectLabel: result.effectSizeLabel,
      theme: null,
    }]

    return {
      pluginId: 'power_analysis',
      data: { result, testType },
      charts: [], findings,
      plainLanguage: this.plainLanguage({ pluginId: 'power_analysis', data: { result, testType }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'power_analysis', testType } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const d = res.data as any
    const r = d.result
    if (!r) return 'No power analysis results.'
    return r.interpretation
  },
}

AnalysisRegistry.register(PowerAnalysisPlugin)
export { PowerAnalysisPlugin }
