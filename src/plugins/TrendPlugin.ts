/**
 * TrendPlugin — shows how a numeric variable changes across time periods.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import { trendOverTime, detectGranularity } from '../engine/temporalAnalysis'
import type { AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract } from './types'
import type { ChartConfig } from '../types/dataTypes'
import type { TrendResult } from '../engine/temporalAnalysis'

function buildTrendChart(r: TrendResult, columnName: string): ChartConfig {
  return {
    id: `trend_${Date.now()}`,
    type: 'scatterPlot',
    data: [
      {
        x: r.periods,
        y: r.means,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Period mean',
        marker: { size: 6, color: brandColors[0] },
        line: { color: brandColors[0] },
      },
      {
        x: r.periods,
        y: r.rollingAvg3,
        type: 'scatter',
        mode: 'lines',
        name: '3-period rolling avg',
        line: { color: brandColors[1], dash: 'dash', width: 2 },
      },
    ],
    layout: {
      ...baseLayout,
      title: { text: `${columnName} over time` },
      xaxis: { title: { text: 'Period' }, tickangle: -45 },
      yaxis: { title: { text: 'Mean' } },
      showlegend: true,
    },
    config: baseConfig,
    stepId: 'trend_over_time',
    edits: {},
  }
}

const TrendPlugin: AnalysisPlugin = {
  id: 'trend_over_time',
  title: 'Trend over time',
  desc: 'Shows how a numeric or rating variable changes across time periods.',
  priority: 25,
  reportPriority: 2,
  requires: ['temporal', 'continuous'],
  forbids: [],
  preconditions: [],
  produces: { description: 'Trend analysis with period means and rolling average', fields: { result: 'TrendResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    // First column = timestamp, second = numeric values
    if (data.columns.length < 2) throw new Error('Trend requires timestamp + numeric column')

    const tsCol = data.columns[0]
    const valCol = data.columns[1]

    const granularity = detectGranularity(tsCol.values as (number | string | null)[])
    const result = trendOverTime(
      valCol.values as (number | null)[],
      tsCol.values as (number | string | null)[],
      granularity
    )

    const charts = result.periods.length >= 2 ? [buildTrendChart(result, valCol.name)] : []

    const peakIdx = result.means.indexOf(Math.max(...result.means))
    const lowIdx = result.means.indexOf(Math.min(...result.means))

    const firstMean = result.means[0] ?? 0
    const lastMean = result.means[result.means.length - 1] ?? 0
    const shift = lastMean - firstMean
    const trendWord = result.overallTrend === 'increasing' ? 'increasing' : result.overallTrend === 'decreasing' ? 'decreasing' : 'flat'

    const findings = [{
      type: 'trend',
      title: `${valCol.name} — ${result.overallTrend} trend over ${granularity}`,
      summary: `${result.periods.length} ${granularity} periods analyzed. R² = ${result.trendStrength.toFixed(3)}.`,
      summaryLanguage: `${valCol.name} is ${trendWord} over time — ${Math.abs(shift).toFixed(1)}-point shift from ${result.periods[0]} to ${result.periods[result.periods.length - 1]}.`,
      detail: JSON.stringify({ granularity, periods: result.periods.length }),
      significant: result.trendStrength > 0.1,
      pValue: null,
      effectSize: result.trendStrength,
      effectLabel: result.overallTrend,
      theme: null,
    }]

    return {
      pluginId: 'trend_over_time',
      data: { result, granularity, columnName: valCol.name },
      charts,
      findings,
      plainLanguage: this.plainLanguage({ pluginId: 'trend_over_time', data: { result, granularity, columnName: valCol.name }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'trend_over_time', granularity, nPeriods: result.periods.length, trend: result.overallTrend } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const d = res.data as { result: TrendResult; granularity: string; columnName: string }
    const r = d.result
    if (!r || r.periods.length === 0) return 'No trend data available.'
    const name = d.columnName ?? 'The variable'
    if (r.overallTrend === 'flat') {
      return `${name} shows no clear trend over ${d.granularity} periods (R² = ${r.trendStrength.toFixed(2)}).`
    }
    const peakIdx = r.means.indexOf(Math.max(...r.means))
    const lowIdx = r.means.indexOf(Math.min(...r.means))
    if (r.overallTrend === 'increasing') {
      return `${name} increased over the study period, with the highest average in ${r.periods[peakIdx]} (${r.means[peakIdx].toFixed(2)}).`
    }
    return `${name} declined over the study period, dropping lowest in ${r.periods[lowIdx]} (${r.means[lowIdx].toFixed(2)}).`
  },
}

AnalysisRegistry.register(TrendPlugin)
export { TrendPlugin }
