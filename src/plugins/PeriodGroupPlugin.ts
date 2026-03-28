/**
 * PeriodGroupPlugin — shows how many responses were collected per time period.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import { groupByPeriod, detectGranularity } from '../engine/temporalAnalysis'
import type { AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract } from './types'
import type { ChartConfig } from '../types/dataTypes'
import type { GroupByPeriodResult } from '../engine/temporalAnalysis'

function buildVolumeChart(r: GroupByPeriodResult): ChartConfig {
  return {
    id: `period_volume_${Date.now()}`,
    type: 'horizontalBar',
    data: [{
      x: r.periods,
      y: r.counts,
      type: 'bar',
      marker: { color: brandColors[0] },
      text: r.counts.map((c) => String(c)),
      textposition: 'outside',
    }],
    layout: {
      ...baseLayout,
      title: { text: 'Response volume over time' },
      xaxis: { title: { text: 'Period' }, tickangle: -45 },
      yaxis: { title: { text: 'Responses' } },
    },
    config: baseConfig,
    stepId: 'period_frequency',
    edits: {},
  }
}

const PeriodGroupPlugin: AnalysisPlugin = {
  id: 'period_frequency',
  title: 'Response volume over time',
  desc: 'Shows how many responses were collected per time period.',
  priority: 15,
  reportPriority: 1,
  requires: ['temporal'],
  forbids: [],
  preconditions: [],
  produces: { description: 'Response counts per time period', fields: { result: 'GroupByPeriodResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    const tsCol = data.columns[0]
    if (!tsCol) throw new Error('PeriodGroupPlugin requires a timestamp column')

    const granularity = detectGranularity(tsCol.values as (number | string | null)[])
    const result = groupByPeriod(tsCol.values as (number | string | null)[], granularity)

    const charts = result.periods.length >= 2 ? [buildVolumeChart(result)] : []
    const totalN = result.counts.reduce((s, c) => s + c, 0)
    const peakIdx = result.counts.indexOf(Math.max(...result.counts))

    const findings = [{
      type: 'period_frequency',
      title: `${totalN} responses across ${result.periods.length} ${granularity} periods`,
      summary: `Peak: ${result.periods[peakIdx]} (${result.counts[peakIdx]} responses).`,
      summaryLanguage: `Responses peak in ${result.periods[peakIdx]} (${result.counts[peakIdx]} responses).`,
      detail: JSON.stringify({ granularity, periods: result.periods }),
      significant: false,
      pValue: null,
      effectSize: null,
      effectLabel: null,
      theme: null,
    }]

    return {
      pluginId: 'period_frequency',
      data: { result, granularity, totalN },
      charts,
      findings,
      plainLanguage: this.plainLanguage({ pluginId: 'period_frequency', data: { result, granularity, totalN }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'period_frequency', granularity, nPeriods: result.periods.length } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const d = res.data as { result: GroupByPeriodResult; granularity: string; totalN: number }
    const r = d.result
    if (!r || r.periods.length === 0) return 'No temporal data available.'
    const peakIdx = r.counts.indexOf(Math.max(...r.counts))
    return `${d.totalN} responses collected across ${r.periods.length} ${d.granularity} periods. Most responses came from ${r.periods[peakIdx]} (${r.counts[peakIdx]} responses).`
  },
}

AnalysisRegistry.register(PeriodGroupPlugin)
export { PeriodGroupPlugin }
