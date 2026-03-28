/**
 * OrdinalRegressionPlugin — predicts an ordered outcome from predictors.
 */
import { AnalysisRegistry } from './AnalysisRegistry'
import * as StatsEngine from '../engine/stats-engine'
import type { AnalysisPlugin, PluginStepResult, ResolvedColumnData, Validator, AssumptionCheck, OutputContract } from './types'

const parallelLinesCheck: Validator = {
  name: 'parallelLinesTest',
  validate(data: ResolvedColumnData): AssumptionCheck {
    const y = data.columns[0].values.filter((v): v is number => typeof v === 'number')
    const xs = data.columns.slice(1).map((c) =>
      c.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    )
    // @ts-ignore
    const result = StatsEngine.parallelLinesTest(y, xs)
    return {
      name: 'parallelLinesTest',
      passed: result.passed,
      message: result.interpretation,
      severity: result.passed ? 'info' : 'warning',
    }
  },
}

const OrdinalRegressionPlugin: AnalysisPlugin = {
  id: 'ordinal_regression',
  title: 'Ordinal regression',
  desc: 'Predicts an ordered outcome from one or more variables.',
  priority: 72,
  reportPriority: 6,
  requires: ['ordinal', 'n>30'],
  forbids: ['binary'],
  preconditions: [parallelLinesCheck],
  produces: { description: 'Ordinal regression with proportional odds', fields: { result: 'OrdinalRegressionResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 2) throw new Error('Ordinal regression requires outcome + at least 1 predictor')

    const outcome = data.columns[0]
    const predictors = data.columns.slice(1)

    const y = outcome.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    const xs = predictors.map((c) =>
      c.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    )

    // Filter complete cases
    const valid: number[] = []
    for (let i = 0; i < y.length; i++) {
      if (!isNaN(y[i]) && xs.every((x) => !isNaN(x[i]))) valid.push(i)
    }
    const yClean = valid.map((i) => y[i])
    const xsClean = xs.map((x) => valid.map((i) => x[i]))

    // @ts-ignore
    const reg = StatsEngine.ordinalRegression(yClean, xsClean)

    const findingFlags: Array<{ type: string; severity: 'info' | 'warning'; detail: Record<string, unknown>; message: string }> = []
    if (!reg.converged) {
      findingFlags.push({ type: 'convergence_warning', severity: 'warning', detail: {}, message: 'Model did not converge. Results may be unreliable.' })
    }

    // @ts-ignore
    const plt = StatsEngine.parallelLinesTest(yClean, xsClean)
    if (!plt.passed) {
      findingFlags.push({ type: 'parallel_lines_violated', severity: 'warning', detail: { chi2: plt.chi2, df: plt.df, p: plt.p }, message: 'The proportional odds assumption may not hold. Interpret results with caution.' })
    }

    const sigCoefs = (reg.coefficients ?? []).filter((c: any) => c.p < 0.05)
    const topCoef = sigCoefs.length > 0 ? sigCoefs.sort((a: any, b: any) => Math.abs(b.oddsRatio - 1) - Math.abs(a.oddsRatio - 1))[0] : null

    const findings = [{
      type: 'ordinal_regression',
      title: topCoef
        ? `${topCoef.name} predicts ${outcome.name} (OR=${topCoef.oddsRatio.toFixed(2)})`
        : `No significant predictors of ${outcome.name}`,
      summary: `Pseudo R² = ${reg.pseudoR2.toFixed(3)}. ${sigCoefs.length} significant predictor(s). ${reg.levels.length} ordinal levels.`,
      detail: JSON.stringify(reg.coefficients),
      significant: reg.converged && sigCoefs.length > 0,
      pValue: topCoef?.p ?? null,
      effectSize: reg.pseudoR2,
      effectLabel: null,
      theme: null,
      flags: findingFlags.length > 0 ? findingFlags : undefined,
    }]

    return {
      pluginId: 'ordinal_regression',
      data: { result: reg, outcomeName: outcome.name, predictorNames: predictors.map((p) => p.name) },
      charts: [], findings,
      plainLanguage: this.plainLanguage({ pluginId: 'ordinal_regression', data: { result: reg, outcomeName: outcome.name, predictorNames: predictors.map((p) => p.name) }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'ordinal_regression', pseudoR2: reg.pseudoR2, converged: reg.converged } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const d = res.data as any
    const r = d.result
    if (!r) return 'No ordinal regression results.'
    const sigCoefs = (r.coefficients ?? []).filter((c: any) => c.p < 0.05)
    const outcomeName = d.outcomeName ?? 'the outcome'
    if (sigCoefs.length === 0) return `No significant predictors of ${outcomeName} were found (pseudo R² = ${r.pseudoR2.toFixed(3)}).`
    const top = sigCoefs.sort((a: any, b: any) => Math.abs(b.oddsRatio - 1) - Math.abs(a.oddsRatio - 1))[0]
    const direction = top.oddsRatio > 1 ? 'higher' : 'lower'
    return `${top.name} significantly predicts ${outcomeName} (OR = ${top.oddsRatio.toFixed(2)}, p ${top.p < 0.001 ? '< .001' : '= ' + top.p.toFixed(3)}). Higher ${top.name} is associated with ${direction} ${outcomeName} scores (pseudo R² = ${r.pseudoR2.toFixed(3)}).`
  },
}

AnalysisRegistry.register(OrdinalRegressionPlugin)
export { OrdinalRegressionPlugin }
