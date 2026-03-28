/**
 * RegressionPlugin — linear regression with beta chart.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface KFoldCVResult {
  k: number
  meanR2orAUC: number
  sdR2orAUC: number
  meanRMSE: number
  sdRMSE: number
  overfit: boolean
  overfitDelta: number
  foldResults: Array<{ fold: number; trainN: number; testN: number; trainMetric: number; testMetric: number; testRMSE: number }>
}

interface RegressionResultData {
  R2: number
  adjR2: number
  F: number
  fP: number
  coefficients: Array<{ name: string; B: number; se: number; t: number; p: number; beta: number }>
  RMSE: number
  durbinWatson: number
  n: number
  nPredictors: number
  cv?: KFoldCVResult
}

function standardize(arr: number[]): number[] {
  const m = arr.reduce((s, v) => s + v, 0) / arr.length
  const ss = arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (arr.length - 1)
  const sd = Math.sqrt(ss)
  return sd === 0 ? arr.map(() => 0) : arr.map((v) => (v - m) / sd)
}

function buildBetaChart(r: RegressionResultData): ChartConfig {
  const predictors = r.coefficients.filter((c) => c.name !== 'intercept')
  const sorted = [...predictors].sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))

  return {
    id: `regression_beta_${Date.now()}`,
    type: 'betaImportance',
    data: [{
      y: sorted.map((c) => c.name),
      x: sorted.map((c) => c.beta),
      type: 'bar',
      orientation: 'h',
      marker: { color: sorted.map((c) => c.p < 0.05 ? brandColors[0] : '#b4b2a9') },
      text: sorted.map((c) => `β=${c.beta.toFixed(3)} (${c.p < 0.05 ? '*' : 'ns'})`),
      textposition: 'outside',
    }],
    layout: {
      ...baseLayout,
      title: { text: `Standardized Coefficients (R² = ${r.R2.toFixed(3)})` },
      xaxis: { title: { text: 'Standardized β' }, zeroline: true },
      yaxis: { automargin: true },
    },
    config: baseConfig,
    stepId: 'regression',
    edits: {},
  }
}

const RegressionPlugin: AnalysisPlugin = {
  id: 'regression',
  title: 'Linear Regression',
  desc: 'OLS regression with standardized betas and importance ranking.',
  priority: 70,
  reportPriority: 6,
  requires: ['continuous', 'n>30'],
  forbids: ['binary'],
  preconditions: [],
  produces: { description: 'R², coefficients, standardized betas', fields: { result: 'RegressionResultData' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 2) throw new Error('Regression requires outcome + at least 1 predictor')

    // First column = outcome, rest = predictors
    const outcome = data.columns[0]
    const predictors = data.columns.slice(1)

    const yRaw = outcome.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    const xsRaw = predictors.map((col) =>
      col.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    )

    // Filter to complete cases
    const n = yRaw.length
    const valid: number[] = []
    for (let i = 0; i < n; i++) {
      if (!isNaN(yRaw[i]) && xsRaw.every((x) => !isNaN(x[i]))) valid.push(i)
    }

    const y = valid.map((i) => yRaw[i])
    const xs = xsRaw.map((x) => valid.map((i) => x[i]))

    // @ts-ignore
    // TODO: add weights support to linearRegression()
    const regRaw = StatsEngine.linearRegression(y, xs)
    if (regRaw.error) throw new Error(regRaw.error)
    const reg = regRaw as { coefficients: number[]; se: number[]; tStats: number[]; pValues: number[]; R2: number; adjR2: number; F: number; fP: number; RMSE: number; durbinWatson: number; residuals: number[] }

    // Compute standardized betas
    const yStd = standardize(y)
    const xsStd = xs.map(standardize)
    // @ts-ignore
    const regStd = StatsEngine.linearRegression(yStd, xsStd)
    const stdBetas: number[] = regStd.error ? xs.map(() => 0) : ((regStd as any).coefficients ?? []).slice(1)

    const coefficients = [
      { name: 'intercept', B: reg.coefficients[0], se: reg.se[0] ?? 0, t: reg.tStats[0] ?? 0, p: reg.pValues[0] ?? 1, beta: 0 },
      ...predictors.map((col, i) => ({
        name: col.name,
        B: reg.coefficients[i + 1],
        se: reg.se[i + 1] ?? 0,
        t: reg.tStats[i + 1] ?? 0,
        p: reg.pValues[i + 1] ?? 1,
        beta: stdBetas[i] ?? 0,
      })),
    ]

    const result: RegressionResultData = {
      R2: reg.R2, adjR2: reg.adjR2, F: reg.F, fP: reg.fP,
      coefficients, RMSE: reg.RMSE, durbinWatson: reg.durbinWatson,
      n: y.length, nPredictors: predictors.length,
    }

    const sigPredictors = coefficients.filter((c) => c.name !== 'intercept' && c.p < 0.05)
    const charts = [buildBetaChart(result)]

    // Cook's Distance — influence diagnostics
    // @ts-ignore
    const cooks = StatsEngine.cooksDistance(y, xs, regRaw) as {
      values: number[]; threshold: number; influentialCount: number; influentialIndices: number[]; error?: string
    }

    // K-fold cross-validation (only if n >= 30)
    let cv: KFoldCVResult | undefined
    if (y.length >= 30) {
      // @ts-ignore
      const cvResult = StatsEngine.kFoldCVLinear(y, xs, 5)
      if (!cvResult.error) {
        cv = cvResult
        result.cv = cv
      }
    }

    const findingFlags: Array<{ type: string; severity: 'info' | 'warning'; detail: Record<string, unknown>; message: string }> = []

    // Overfit warning from CV
    if (cv?.overfit) {
      findingFlags.push({
        type: 'overfit_warning',
        severity: 'warning',
        detail: {
          trainingR2: reg.R2,
          cvR2: cv.meanR2orAUC,
          delta: cv.overfitDelta,
        },
        message: `Model R² is ${reg.R2.toFixed(2)} on training data but ${cv.meanR2orAUC.toFixed(2)} on held-out data. The model may be overfitting.`,
      })
    }

    if (cooks.influentialCount > 0) {
      const severity = cooks.influentialCount / y.length > 0.05 ? 'warning' as const : 'info' as const
      findingFlags.push({
        type: 'influential_outliers',
        severity,
        detail: {
          influentialCount: cooks.influentialCount,
          threshold: cooks.threshold,
          influentialIndices: cooks.influentialIndices,
        },
        message: `${cooks.influentialCount} observation(s) have Cook's D > ${cooks.threshold.toFixed(3)} and may be driving the regression result. Consider re-running without these observations.`,
      })
    }

    const findings = [{
      type: 'regression',
      title: `R² = ${reg.R2.toFixed(3)} — ${sigPredictors.length} significant predictor(s)`,
      summary: `Model ${reg.fP < 0.05 ? 'is significant' : 'is not significant'} (F = ${reg.F.toFixed(2)}, p = ${reg.fP < 0.001 ? '<.001' : reg.fP.toFixed(3)}). ${sigPredictors.map((c) => `${c.name} (β=${c.beta.toFixed(3)})`).join(', ') || 'No significant predictors.'}`,
      detail: JSON.stringify(coefficients),
      significant: reg.fP < 0.05,
      pValue: reg.fP,
      effectSize: reg.R2,
      effectLabel: reg.R2 > 0.26 ? 'large' : reg.R2 > 0.13 ? 'medium' : reg.R2 > 0.02 ? 'small' : 'negligible',
      theme: null,
      flags: findingFlags.length > 0 ? findingFlags : undefined,
    }]

    return {
      pluginId: 'regression', data: { result, outcomeName: outcome.name }, charts, findings,
      plainLanguage: this.plainLanguage({ pluginId: 'regression', data: { result, outcomeName: outcome.name }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: {
        pluginId: 'regression',
        R2: reg.R2,
        nPredictors: predictors.length,
        influentialOutlierCount: cooks.influentialCount,
        cooksThreshold: cooks.threshold,
        outcomeColumnId: outcome.id,
        outcomeColumnName: outcome.name,
        predictorColumnIds: predictors.map((p) => p.id),
        predictorColumnNames: predictors.map((p) => p.name),
      } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: RegressionResultData }).result
    if (!r) return 'No regression results.'
    const predictors = r.coefficients.filter((c) => c.name !== 'intercept')
    const sigPredictors = predictors.filter((c) => c.p < 0.05).sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))
    const r2Pct = (r.R2 * 100).toFixed(0)
    const outcomeName = (res.data as any).outcomeName ?? 'the outcome'

    let cvNote = ''
    if (r.cv) {
      const cvPct = (r.cv.meanR2orAUC * 100).toFixed(0)
      if (r.cv.overfit) {
        cvNote = ` The model explains ${r2Pct}% in training data but only ${cvPct}% on held-out data — interpret with caution.`
      } else {
        cvNote = ` (${cvPct}% on held-out data — generalises well).`
      }
    }

    if (sigPredictors.length === 0) {
      return `The model explains ${r2Pct}% of the variation in ${outcomeName}, but no individual predictor reaches significance.${cvNote}`
    }
    const top = sigPredictors[0]
    if (r.cv && !r.cv.overfit) {
      return `${top.name} is the strongest predictor of ${outcomeName} (beta = ${top.beta.toFixed(2)}, p ${top.p < 0.001 ? '< .001' : '= ' + top.p.toFixed(3)}). The model explains ${r2Pct}% of the variation${cvNote}`
    }
    return `${top.name} is the strongest predictor of ${outcomeName} (beta = ${top.beta.toFixed(2)}, p ${top.p < 0.001 ? '< .001' : '= ' + top.p.toFixed(3)}). The model explains ${r2Pct}% of the variation.${cvNote}`
  },
}

AnalysisRegistry.register(RegressionPlugin)
export { RegressionPlugin }
