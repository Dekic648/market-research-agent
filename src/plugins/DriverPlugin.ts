/**
 * DriverPlugin — key driver analysis.
 *
 * Runs regression with ALL available predictors against an outcome variable,
 * then ranks by standardized beta (importance).
 * Depends on RegressionPlugin infrastructure.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
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
      y: sorted.map((p) => p.name),
      x: sorted.map((p) => p.importance),
      type: 'bar',
      orientation: 'h',
      marker: { color: sorted.map((p) => p.p < 0.05 ? brandColors[1] : '#b4b2a9') },
      text: sorted.map((p) => `${(p.importance * 100).toFixed(1)}%`),
      textposition: 'outside',
    }],
    layout: {
      ...baseLayout,
      title: { text: `Key Drivers of ${r.outcomeName} (R² = ${r.R2.toFixed(3)})` },
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
  desc: 'Identifies which factors most strongly drive the outcome variable.',
  priority: 75,
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

    // Cook's Distance
    // @ts-ignore
    const cooks = StatsEngine.cooksDistance(y, xs, regRaw) as {
      values: number[]; threshold: number; influentialCount: number; influentialIndices: number[]; error?: string
    }

    const findingFlags: Array<{ type: string; severity: 'info' | 'warning'; detail: Record<string, unknown>; message: string }> = []
    if (cooks.influentialCount > 0) {
      const severity = cooks.influentialCount / y.length > 0.05 ? 'warning' as const : 'info' as const
      findingFlags.push({
        type: 'influential_outliers',
        severity,
        detail: { influentialCount: cooks.influentialCount, threshold: cooks.threshold, influentialIndices: cooks.influentialIndices },
        message: `${cooks.influentialCount} observation(s) have Cook's D > ${cooks.threshold.toFixed(3)} and may be driving the result.`,
      })
    }

    const findings = [{
      type: 'driver',
      title: `Top driver: ${topDriver?.name} (${(topDriver?.importance * 100).toFixed(1)}% relative importance)`,
      summary: `R² = ${result.R2.toFixed(3)}. ${result.predictors.filter((p) => p.p < 0.05).length} of ${result.predictors.length} drivers are significant.`,
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
      plainLanguage: `Top driver of ${outcome.name}: "${topDriver?.name}" (${(topDriver?.importance * 100).toFixed(1)}%).`,
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
    if (!r) return 'No driver analysis results.'
    return `Top driver of ${r.outcomeName}: "${r.predictors[0]?.name}" at ${(r.predictors[0]?.importance * 100).toFixed(1)}% relative importance.`
  },
}

AnalysisRegistry.register(DriverPlugin)
export { DriverPlugin }
