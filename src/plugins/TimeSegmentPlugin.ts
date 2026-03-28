/**
 * TimeSegmentPlugin — tests whether scores differ significantly across time periods.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import { groupByPeriod, detectGranularity } from '../engine/temporalAnalysis'
import * as StatsEngine from '../engine/stats-engine'
import type { AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract } from './types'
import type { ChartConfig } from '../types/dataTypes'

function buildMeansChart(periods: string[], means: number[], columnName: string): ChartConfig {
  return {
    id: `time_segment_${Date.now()}`,
    type: 'horizontalBar',
    data: [{
      x: periods,
      y: means,
      type: 'bar',
      marker: { color: brandColors[0] },
      text: means.map((m) => m.toFixed(2)),
      textposition: 'outside',
    }],
    layout: {
      ...baseLayout,
      title: { text: `${columnName} by time period` },
      xaxis: { title: { text: 'Period' }, tickangle: -45 },
      yaxis: { title: { text: 'Mean' } },
    },
    config: baseConfig,
    stepId: 'time_segment_comparison',
    edits: {},
  }
}

function effectLabel(eps: number): string {
  if (eps < 0.01) return 'negligible'
  if (eps < 0.06) return 'small'
  if (eps < 0.14) return 'medium'
  return 'large'
}

const TimeSegmentPlugin: AnalysisPlugin = {
  id: 'time_segment_comparison',
  title: 'Compare across time periods',
  desc: 'Tests whether scores differ significantly across time periods.',
  priority: 35,
  reportPriority: 3,
  requires: ['temporal', 'continuous'],
  forbids: [],
  preconditions: [],
  produces: { description: 'KW test across time periods', fields: { result: 'TimeSegmentResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 2) throw new Error('TimeSegmentPlugin requires timestamp + numeric column')

    const tsCol = data.columns[0]
    const valCol = data.columns[1]

    const granularity = detectGranularity(tsCol.values as (number | string | null)[])
    const grouped = groupByPeriod(tsCol.values as (number | string | null)[], granularity)

    // Guard: 2–8 periods, each with ≥ 5 responses
    if (grouped.periods.length < 2 || grouped.periods.length > 8) {
      return {
        pluginId: 'time_segment_comparison', data: { skipped: true },
        charts: [], findings: [],
        plainLanguage: `Skipped — ${grouped.periods.length} time periods (need 2–8).`,
        assumptions: [],
        logEntry: { type: 'analysis_run', payload: { pluginId: 'time_segment_comparison', skipped: true } },
      }
    }

    // Build groups of numeric values per period
    const groups: number[][] = []
    const periodMeans: number[] = []
    for (let p = 0; p < grouped.periods.length; p++) {
      const indices = grouped.rowIndices[p]
      const vals = indices
        .map((i) => valCol.values[i])
        .filter((v): v is number => typeof v === 'number')
      if (vals.length < 5) {
        return {
          pluginId: 'time_segment_comparison', data: { skipped: true },
          charts: [], findings: [],
          plainLanguage: `Skipped — period ${grouped.periods[p]} has only ${vals.length} responses (need ≥ 5).`,
          assumptions: [],
          logEntry: { type: 'analysis_run', payload: { pluginId: 'time_segment_comparison', skipped: true } },
        }
      }
      groups.push(vals)
      periodMeans.push(vals.reduce((s, v) => s + v, 0) / vals.length)
    }

    // @ts-ignore
    const kw = StatsEngine.kruskalWallis(groups)

    const N = groups.reduce((s, g) => s + g.length, 0)
    const eps = (kw.H - groups.length + 1) / (N - groups.length)
    const epsSq = Math.max(0, eps)

    const highIdx = periodMeans.indexOf(Math.max(...periodMeans))
    const lowIdx = periodMeans.indexOf(Math.min(...periodMeans))

    const charts = [buildMeansChart(grouped.periods, periodMeans, valCol.name)]

    const findings = [{
      type: 'time_segment_comparison',
      title: `${valCol.name} — ${kw.p < 0.05 ? 'significant' : 'no significant'} difference across ${granularity} periods`,
      summary: `Highest: ${grouped.periods[highIdx]} (mean ${periodMeans[highIdx].toFixed(2)}). Lowest: ${grouped.periods[lowIdx]} (mean ${periodMeans[lowIdx].toFixed(2)}).`,
      detail: JSON.stringify({ H: kw.H, p: kw.p, df: kw.df, epsilonSquared: epsSq }),
      significant: kw.p < 0.05,
      pValue: kw.p,
      effectSize: epsSq,
      effectLabel: effectLabel(epsSq),
      theme: null,
    }]

    return {
      pluginId: 'time_segment_comparison',
      data: { periods: grouped.periods, periodMeans, H: kw.H, p: kw.p, epsilonSquared: epsSq, columnName: valCol.name, granularity },
      charts,
      findings,
      plainLanguage: this.plainLanguage({ pluginId: 'time_segment_comparison', data: { periods: grouped.periods, periodMeans, H: kw.H, p: kw.p, epsilonSquared: epsSq, columnName: valCol.name, granularity }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'time_segment_comparison', granularity, nPeriods: grouped.periods.length, p: kw.p } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const d = res.data as { periods: string[]; periodMeans: number[]; p: number; epsilonSquared: number; columnName: string; granularity: string; skipped?: boolean }
    if (d.skipped || !d.periods) return 'Time segment comparison was skipped.'
    const name = d.columnName ?? 'The variable'
    const highIdx = d.periodMeans.indexOf(Math.max(...d.periodMeans))
    const lowIdx = d.periodMeans.indexOf(Math.min(...d.periodMeans))
    if (d.p >= 0.05) {
      return `${name} does not differ significantly across ${d.granularity} periods (p = ${d.p.toFixed(3)}).`
    }
    return `${name} scores differ significantly across ${d.granularity} periods (p ${d.p < 0.001 ? '< .001' : '= ' + d.p.toFixed(3)}, ${effectLabel(d.epsilonSquared)} effect). ${d.periods[highIdx]} scores highest, ${d.periods[lowIdx]} scores lowest.`
  },
}

AnalysisRegistry.register(TimeSegmentPlugin)
export { TimeSegmentPlugin }
