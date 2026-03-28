/**
 * LogisticRegressionPlugin — binary outcome prediction.
 *
 * "Which attitudes predict whether someone will pay / churn / convert?"
 * Uses engine's logisticRegression (IRLS) + kFoldCVLogistic + computeAUC.
 * Charts: odds ratio bar chart centered at OR=1.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract, FindingFlag,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface LogisticCoefficient {
  name: string
  B: number       // log-odds
  OR: number      // odds ratio = exp(B)
  orLower: number  // 95% CI lower
  orUpper: number  // 95% CI upper
  se: number
  z: number
  p: number
  significant: boolean
}

interface LogisticResult {
  coefficients: LogisticCoefficient[]
  auc: number
  pseudoR2: number
  pctCorrect: number
  n: number
  nPredictors: number
  converged: boolean
  cvAUC?: number
  cvOverfit?: boolean
  classBalance: { positive: number; negative: number; positivePct: number }
}

function buildOddsRatioChart(result: LogisticResult, outcomeName: string): ChartConfig {
  const predictors = result.coefficients.filter((c) => c.name !== 'intercept')
  const sorted = [...predictors].sort((a, b) => Math.abs(Math.log(b.OR)) - Math.abs(Math.log(a.OR)))

  return {
    id: `logistic_or_${Date.now()}`,
    type: 'horizontalBar',
    data: [{
      y: sorted.map((c) => c.name),
      x: sorted.map((c) => c.OR),
      type: 'bar',
      orientation: 'h',
      marker: {
        color: sorted.map((c) => c.significant
          ? (c.OR > 1 ? '#1d9e75' : '#e24b4a')
          : '#b4b2a9'),
      },
      error_x: {
        type: 'data',
        symmetric: false,
        array: sorted.map((c) => c.orUpper - c.OR),
        arrayminus: sorted.map((c) => c.OR - c.orLower),
      },
      text: sorted.map((c) => `OR=${c.OR.toFixed(2)} ${c.significant ? '*' : 'ns'}`),
      textposition: 'outside',
    }],
    layout: {
      ...baseLayout,
      title: { text: `Odds Ratios — Predicting ${outcomeName}` },
      xaxis: { title: { text: 'Odds Ratio' }, type: 'log' },
      yaxis: { automargin: true },
      shapes: [{
        type: 'line', x0: 1, x1: 1, y0: -0.5, y1: sorted.length - 0.5,
        line: { color: '#666', dash: 'dot', width: 1 },
      }],
    },
    config: baseConfig,
    stepId: 'logistic_regression',
    edits: {},
  }
}

const LogisticRegressionPlugin: AnalysisPlugin = {
  id: 'logistic_regression',
  title: 'Logistic Regression',
  desc: 'Predicts binary outcomes — which factors increase or decrease the odds.',
  priority: 72,
  reportPriority: 6,
  requires: ['continuous', 'n>30'],
  preconditions: [],
  produces: {
    description: 'Odds ratios, AUC, classification accuracy, cross-validated AUC',
    fields: { result: 'LogisticResult' },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 2) throw new Error('Logistic regression requires outcome + at least 1 predictor')

    const outcome = data.columns[0]
    const predictors = data.columns.slice(1)

    const yRaw = outcome.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    const xsRaw = predictors.map((col) =>
      col.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    )

    // Complete cases
    const valid: number[] = []
    for (let i = 0; i < yRaw.length; i++) {
      if (!isNaN(yRaw[i]) && xsRaw.every((x) => !isNaN(x[i]))) valid.push(i)
    }

    const y = valid.map((i) => yRaw[i])
    const xs = xsRaw.map((x) => valid.map((i) => x[i]))

    // Validate binary outcome
    const unique = new Set(y)
    if (unique.size !== 2 || ![0, 1].every((v) => unique.has(v))) {
      throw new Error('Logistic regression requires a binary outcome (0 and 1 only)')
    }

    if (y.length < 50) throw new Error('Logistic regression requires n > 50')

    // Class balance check
    const posCount = y.filter((v) => v === 1).length
    const classBalance = {
      positive: posCount,
      negative: y.length - posCount,
      positivePct: (posCount / y.length) * 100,
    }

    // @ts-ignore
    const regRaw = StatsEngine.logisticRegression(y, xs) as any
    if (regRaw.error) throw new Error(regRaw.error)

    // Compute AUC
    // @ts-ignore
    const auc = StatsEngine.computeAUC(y, regRaw.predicted) as number

    // % correctly classified (threshold 0.5)
    let correct = 0
    for (let i = 0; i < y.length; i++) {
      const predicted = regRaw.predicted[i] >= 0.5 ? 1 : 0
      if (predicted === y[i]) correct++
    }
    const pctCorrect = (correct / y.length) * 100

    // Build coefficients with OR and CI
    const coefficients: LogisticCoefficient[] = [
      {
        name: 'intercept',
        B: regRaw.coefficients[0],
        OR: regRaw.oddsRatios[0],
        orLower: Math.exp(regRaw.coefficients[0] - 1.96 * (regRaw.se[0] ?? 0)),
        orUpper: Math.exp(regRaw.coefficients[0] + 1.96 * (regRaw.se[0] ?? 0)),
        se: regRaw.se[0] ?? 0,
        z: regRaw.zStats[0] ?? 0,
        p: regRaw.pValues[0] ?? 1,
        significant: (regRaw.pValues[0] ?? 1) < 0.05,
      },
      ...predictors.map((col, i) => {
        const idx = i + 1
        return {
          name: col.name,
          B: regRaw.coefficients[idx],
          OR: regRaw.oddsRatios[idx],
          orLower: Math.exp(regRaw.coefficients[idx] - 1.96 * (regRaw.se[idx] ?? 0)),
          orUpper: Math.exp(regRaw.coefficients[idx] + 1.96 * (regRaw.se[idx] ?? 0)),
          se: regRaw.se[idx] ?? 0,
          z: regRaw.zStats[idx] ?? 0,
          p: regRaw.pValues[idx] ?? 1,
          significant: (regRaw.pValues[idx] ?? 1) < 0.05,
        }
      }),
    ]

    // Cross-validation
    let cvAUC: number | undefined
    let cvOverfit = false
    if (y.length >= 50) {
      // @ts-ignore
      const cvResult = StatsEngine.kFoldCVLogistic(y, xs, 5) as any
      if (!cvResult.error) {
        cvAUC = cvResult.meanR2orAUC
        cvOverfit = auc - (cvAUC ?? 0) > 0.1
      }
    }

    const result: LogisticResult = {
      coefficients,
      auc,
      pseudoR2: regRaw.pseudoR2,
      pctCorrect,
      n: y.length,
      nPredictors: predictors.length,
      converged: regRaw.converged,
      cvAUC,
      cvOverfit,
      classBalance,
    }

    const charts = [buildOddsRatioChart(result, outcome.name)]

    // Flags
    const flags: FindingFlag[] = []
    if (classBalance.positivePct < 10 || classBalance.positivePct > 90) {
      flags.push({
        type: 'class_imbalance',
        severity: 'warning',
        detail: { positivePct: classBalance.positivePct },
        message: `Warning: outcome is imbalanced (${classBalance.positivePct.toFixed(0)}% positive). Interpret with caution.`,
      })
    }
    if (cvOverfit) {
      flags.push({
        type: 'overfit_warning',
        severity: 'warning',
        detail: { trainingAUC: auc, cvAUC },
        message: `Model may be overfitting — training AUC = ${auc.toFixed(2)} but CV-AUC = ${cvAUC?.toFixed(2)}. Treat predictions cautiously.`,
      })
    }

    const sigPredictors = coefficients.filter((c) => c.name !== 'intercept' && c.significant)
    const topSigPredictor = sigPredictors.sort((a, b) => Math.abs(Math.log(b.OR)) - Math.abs(Math.log(a.OR)))[0]

    const findings = [{
      type: 'logistic_regression',
      title: `AUC = ${auc.toFixed(3)} — ${sigPredictors.length} significant predictor(s) of ${outcome.name}`,
      summary: `The model correctly classifies ${pctCorrect.toFixed(0)}% of cases (AUC = ${auc.toFixed(2)}). ${sigPredictors.map((c) => {
        const pctChange = ((c.OR - 1) * 100)
        const dir = c.OR > 1 ? 'increases' : 'decreases'
        return `${c.name} ${dir} the odds by ${Math.abs(pctChange).toFixed(0)}% (OR = ${c.OR.toFixed(2)})`
      }).join('. ') || 'No significant predictors.'}.`,
      summaryLanguage: topSigPredictor
        ? `${topSigPredictor.name} most strongly predicts ${outcome.name} — each unit increase ${topSigPredictor.OR > 1 ? 'raises' : 'lowers'} the likelihood by ${Math.abs((topSigPredictor.OR - 1) * 100).toFixed(0)}%.`
        : `None of the predictors meaningfully predict ${outcome.name}.`,
      detail: JSON.stringify(coefficients),
      significant: sigPredictors.length > 0,
      pValue: regRaw.pValues?.[1] ?? null,
      effectSize: auc,
      effectLabel: auc > 0.8 ? 'excellent' : auc > 0.7 ? 'acceptable' : auc > 0.6 ? 'poor' : 'failing',
      theme: null,
      flags: flags.length > 0 ? flags : undefined,
    }]

    return {
      pluginId: 'logistic_regression',
      data: { result, outcomeName: outcome.name },
      charts,
      findings,
      plainLanguage: this.plainLanguage({
        pluginId: 'logistic_regression', data: { result, outcomeName: outcome.name },
        charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {},
      }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'logistic_regression', auc, n: y.length, nPredictors: predictors.length } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: LogisticResult; outcomeName: string }).result
    const outcomeName = (res.data as any).outcomeName ?? 'the outcome'
    if (!r) return 'No logistic regression results.'

    let text = `The model correctly classifies ${r.pctCorrect.toFixed(0)}% of cases (AUC = ${r.auc.toFixed(2)}).`

    if (r.auc < 0.6) {
      text += ` Model fit is weak — predictors explain little variance in ${outcomeName}.`
    }

    const sigPredictors = r.coefficients.filter((c) => c.name !== 'intercept' && c.significant)
    for (const c of sigPredictors.slice(0, 3)) {
      const pctChange = Math.abs((c.OR - 1) * 100).toFixed(0)
      const dir = c.OR > 1 ? 'increases' : 'decreases'
      text += ` ${c.name} ${dir} the odds of ${outcomeName} by ${pctChange}% (OR = ${c.OR.toFixed(2)}, p ${c.p < 0.001 ? '< .001' : '= ' + c.p.toFixed(3)}).`
    }

    if (r.classBalance.positivePct < 10 || r.classBalance.positivePct > 90) {
      text += ` Caution: outcome is imbalanced (${r.classBalance.positivePct.toFixed(0)}% positive).`
    }

    if (r.cvOverfit) {
      text += ` Model may be overfitting — treat predictions cautiously.`
    }

    return text
  },
}

AnalysisRegistry.register(LogisticRegressionPlugin)
export { LogisticRegressionPlugin }
