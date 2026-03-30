/**
 * DriverPlugin — key driver analysis.
 *
 * Runs regression with ALL available predictors against an outcome variable,
 * then ranks by standardized beta (importance).
 * Depends on RegressionPlugin infrastructure.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors, truncateLabel } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface DriverResult {
  outcomeName: string
  R2: number
  predictors: Array<{ name: string; beta: number; p: number; importance: number }>
}

function standardize(arr: number[]): number[] {
  const m = arr.reduce((s, v) => s + v, 0) / arr.length
  const ss = arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (arr.length - 1)
  const sd = Math.sqrt(ss)
  return sd === 0 ? arr.map(() => 0) : arr.map((v) => (v - m) / sd)
}

function buildDriverChart(r: DriverResult): ChartConfig {
  const sorted = [...r.predictors].sort((a, b) => b.importance - a.importance)
  return {
    id: `driver_importance_${Date.now()}`,
    type: 'betaImportance',
    data: [{
      y: sorted.map((p) => truncateLabel(p.name, 50)),
      x: sorted.map((p) => p.importance),
      type: 'bar',
      orientation: 'h',
      marker: { color: sorted.map((p) => p.p < 0.05 ? brandColors[1] : '#b4b2a9') },
      text: sorted.map((p) => `${(p.importance * 100).toFixed(1)}%`),
      textposition: 'outside',
      customdata: sorted.map((p) => p.name),
      hovertemplate: '%{customdata}: %{x:.1%}<extra></extra>',
    }],
    layout: {
      ...baseLayout,
      title: { text: `Key Drivers of ${truncateLabel(r.outcomeName, 40)} (R² = ${r.R2.toFixed(3)})` },
      xaxis: { title: { text: 'Relative Importance' }, tickformat: '.0%' },
      yaxis: { automargin: true },
    },
    config: baseConfig,
    stepId: 'driver_analysis',
    edits: {},
  }
}

const DriverPlugin: AnalysisPlugin = {
  id: 'driver_analysis',
  title: 'Key Driver Analysis',
  desc: 'What matters most? Ranks factors by how much they drive the outcome.',
  priority: 75,
  reportPriority: 6,
  requires: ['continuous', 'n>30'],
  forbids: ['binary'],
  dependsOn: ['regression'],
  preconditions: [],
  produces: { description: 'Ranked predictors by relative importance', fields: { result: 'DriverResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 3) throw new Error('Driver analysis needs outcome + at least 2 predictors')

    const outcome = data.columns[0]
    const predictors = data.columns.slice(1)

    const yRaw = outcome.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    const xsRaw = predictors.map((col) =>
      col.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    )

    const n = yRaw.length
    const valid: number[] = []
    for (let i = 0; i < n; i++) {
      if (!isNaN(yRaw[i]) && xsRaw.every((x) => !isNaN(x[i]))) valid.push(i)
    }

    const y = valid.map((i) => yRaw[i])
    const xs = xsRaw.map((x) => valid.map((i) => x[i]))

    // Standardized regression for betas
    const yStd = standardize(y)
    const xsStd = xs.map(standardize)
    // @ts-ignore
    const reg = StatsEngine.linearRegression(yStd, xsStd)
    if (reg.error) throw new Error(reg.error)

    // @ts-ignore
    const regRaw = StatsEngine.linearRegression(y, xs)

    // Relative importance: |beta| / sum(|beta|)
    const betas: number[] = (reg.coefficients ?? []).slice(1)
    const pVals: number[] = reg.pValues ?? []
    const absBetaSum = betas.reduce((s: number, b: number) => s + Math.abs(b), 0)

    const driverPredictors = predictors.map((col, i) => ({
      name: col.name,
      beta: betas[i] ?? 0,
      p: pVals[i + 1] ?? 1,
      importance: absBetaSum > 0 ? Math.abs(betas[i] ?? 0) / absBetaSum : 0,
    }))

    const result: DriverResult = {
      outcomeName: outcome.name,
      R2: regRaw.R2 ?? 0,
      predictors: driverPredictors.sort((a, b) => b.importance - a.importance),
    }

    const charts = [buildDriverChart(result)]
    const topDriver = result.predictors[0]

    // K-fold cross-validation
    let cvR2: number | null = null
    let cvOverfit = false
    if (y.length >= 30) {
      // @ts-ignore
      const cvResult = StatsEngine.kFoldCVLinear(y, xs, 5)
      if (!cvResult.error) {
        cvR2 = cvResult.meanR2orAUC
        cvOverfit = cvResult.overfit
      }
    }

    // Cook's Distance
    // @ts-ignore
    const cooks = StatsEngine.cooksDistance(y, xs, regRaw) as {
      values: number[]; threshold: number; influentialCount: number; influentialIndices: number[]; error?: string
    }

    const findingFlags: Array<{ type: string; severity: 'info' | 'warning'; detail: Record<string, unknown>; message: string }> = []

    if (cvOverfit && cvR2 !== null) {
      findingFlags.push({
        type: 'overfit_warning',
        severity: 'warning',
        detail: { trainingR2: result.R2, cvR2, delta: result.R2 - cvR2 },
        message: `Model R² is ${result.R2.toFixed(2)} on training data but ${cvR2.toFixed(2)} on held-out data. Driver rankings may not generalise.`,
      })
    }

    if (cooks.influentialCount > 0) {
      const severity = cooks.influentialCount / y.length > 0.05 ? 'warning' as const : 'info' as const
      findingFlags.push({
        type: 'influential_outliers',
        severity,
        detail: { influentialCount: cooks.influentialCount, threshold: cooks.threshold, influentialIndices: cooks.influentialIndices },
        message: `${cooks.influentialCount} observation(s) have Cook's D > ${cooks.threshold.toFixed(3)} and may be driving the result.`,
      })
    }

    const driverR2Pct = (result.R2 * 100).toFixed(0)

    let driverSummaryLanguage: string
    if (result.R2 < 0.05) {
      driverSummaryLanguage = `The measured attributes explain very little of the variation in ${outcome.name} (${driverR2Pct}%) — other factors are likely at play.`
    } else if (result.R2 < 0.15) {
      driverSummaryLanguage = topDriver
        ? `${topDriver.name} shows a modest relationship with ${outcome.name} — the attributes account for ${driverR2Pct}% of the variation.`
        : `The attributes show a modest relationship with ${outcome.name} (${driverR2Pct}% of variation).`
    } else {
      driverSummaryLanguage = topDriver
        ? `${topDriver.name} is the strongest driver of ${outcome.name} — it accounts for ${(topDriver.importance * 100).toFixed(0)}% of the explained variation.`
        : `No single factor stands out as a clear driver of ${outcome.name}.`
    }

    // Weak model warning flag
    if (result.R2 < 0.05) {
      findingFlags.push({
        type: 'weak_model',
        severity: 'warning',
        detail: { R2: result.R2 },
        message: `Model fit is weak (R² = ${driverR2Pct}%). These predictors account for very little of the variation in ${outcome.name}. Driver rankings may not be reliable.`,
      })
    }

    const findings = [{
      type: 'driver',
      title: `Top driver: ${topDriver?.name} (${(topDriver?.importance * 100).toFixed(1)}% relative importance)`,
      summary: `R² = ${result.R2.toFixed(3)}. ${result.predictors.filter((p) => p.p < 0.05).length} of ${result.predictors.length} drivers are significant.`,
      summaryLanguage: driverSummaryLanguage,
      detail: JSON.stringify(result.predictors.slice(0, 5)),
      significant: (regRaw.fP ?? 1) < 0.05,
      pValue: regRaw.fP ?? null,
      effectSize: result.R2,
      effectLabel: null,
      theme: null,
      flags: findingFlags.length > 0 ? findingFlags : undefined,
    }]

    return {
      pluginId: 'driver_analysis', data: { result }, charts, findings,
      plainLanguage: this.plainLanguage({ pluginId: 'driver_analysis', data: { result }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: {
        pluginId: 'driver_analysis',
        R2: result.R2,
        topDriver: topDriver?.name,
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
    const r = (res.data as { result: DriverResult }).result
    if (!r || r.predictors.length === 0) return 'No driver analysis results.'
    const top = r.predictors[0]
    const second = r.predictors.length > 1 ? r.predictors[1] : null
    const third = r.predictors.length > 2 ? r.predictors[2] : null
    let text = `${top.name} is the most important driver of ${r.outcomeName} — improving it has the strongest predicted impact.`
    const others = [second, third].filter((p) => p && p.importance > 0.05)
    if (others.length > 0) {
      text += ` ${others.map((p) => p!.name).join(' and ')} also contribute${others.length === 1 ? 's' : ''} meaningfully.`
    }
    return text
  },
}

AnalysisRegistry.register(DriverPlugin)
export { DriverPlugin }
