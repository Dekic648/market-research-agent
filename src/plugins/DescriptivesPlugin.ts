/**
 * DescriptivesPlugin — distribution summary for continuous/behavioral columns.
 *
 * Produces: mean, median, SD, skewness, kurtosis, percentiles, zero-rate.
 * Charts: histogram (20 bins), horizontal box plot approximation.
 * Designed for behavioral metrics (revenue, counts, engagement) where
 * FrequencyPlugin's Top2Box/Bot2Box is meaningless.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface DescriptiveStats {
  columnName: string
  n: number
  mean: number
  median: number
  sd: number
  min: number
  max: number
  p25: number
  p75: number
  skewness: number
  kurtosis: number
  zeroRate: number
  isSkewed: boolean
  isZeroInflated: boolean
}

interface DescriptivesResult {
  stats: DescriptiveStats[]
}

function buildHistogram(stat: DescriptiveStats, values: number[]): ChartConfig {
  return {
    id: `descriptives_hist_${stat.columnName}_${Date.now()}`,
    type: 'histogram' as any,
    data: [{
      x: values,
      type: 'histogram',
      nbinsx: 20,
      marker: { color: brandColors[0], opacity: 0.8 },
      name: stat.columnName,
    }],
    layout: {
      ...baseLayout,
      title: { text: `Distribution: ${stat.columnName}` },
      xaxis: { title: { text: stat.columnName } },
      yaxis: { title: { text: 'Count' } },
    },
    config: baseConfig,
    stepId: 'descriptives',
    edits: {},
  }
}

function buildBoxPlot(stat: DescriptiveStats, values: number[]): ChartConfig {
  return {
    id: `descriptives_box_${stat.columnName}_${Date.now()}`,
    type: 'boxPlot' as any,
    data: [{
      y: values,
      type: 'box',
      name: stat.columnName,
      marker: { color: brandColors[1] },
      boxmean: true,
    }],
    layout: {
      ...baseLayout,
      title: { text: `Box Plot: ${stat.columnName}` },
      yaxis: { title: { text: stat.columnName } },
    },
    config: baseConfig,
    stepId: 'descriptives',
    edits: {},
  }
}

const DescriptivesPlugin: AnalysisPlugin = {
  id: 'descriptives',
  title: 'Descriptive Statistics',
  desc: 'Distribution summary with histogram and box plot for continuous variables.',
  priority: 10,
  reportPriority: 1,
  requires: ['continuous'],
  preconditions: [],
  produces: {
    description: 'Descriptive statistics with distribution diagnostics',
    fields: { result: 'DescriptivesResult' },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    const allStats: DescriptiveStats[] = []
    const charts: ChartConfig[] = []
    const findings: PluginStepResult['findings'] = []

    for (const col of data.columns) {
      const nums: number[] = []
      let zeroCount = 0
      for (const v of col.values) {
        if (v === null) continue
        const n = typeof v === 'number' ? v : parseFloat(String(v))
        if (isNaN(n)) continue
        nums.push(n)
        if (n === 0) zeroCount++
      }

      if (nums.length === 0) continue

      // @ts-ignore
      const desc = StatsEngine.describe(nums) as Record<string, any>
      const skew: number = desc.skewness ?? 0
      const kurt: number = desc.kurtosis ?? 0
      const zeroRate = nums.length > 0 ? zeroCount / nums.length : 0
      const isSkewed = Math.abs(skew) > 1.5
      const isZeroInflated = zeroRate > 0.1

      const stat: DescriptiveStats = {
        columnName: col.name,
        n: desc.n ?? nums.length,
        mean: desc.mean ?? 0,
        median: desc.median ?? 0,
        sd: desc.sd ?? 0,
        min: desc.min ?? 0,
        max: desc.max ?? 0,
        p25: desc.p25 ?? 0,
        p75: desc.p75 ?? 0,
        skewness: skew,
        kurtosis: kurt,
        zeroRate,
        isSkewed,
        isZeroInflated,
      }
      allStats.push(stat)

      charts.push(buildHistogram(stat, nums))
      charts.push(buildBoxPlot(stat, nums))

      // Build finding for this column
      let summary: string
      if (isZeroInflated) {
        summary = `${(zeroRate * 100).toFixed(0)}% of values are zero. Median = ${stat.median.toFixed(2)}, Mean = ${stat.mean.toFixed(2)}. Consider analyzing zero vs non-zero groups separately before combining.`
      } else if (isSkewed) {
        summary = `Distribution is ${skew > 0 ? 'right' : 'left'}-skewed (skewness = ${skew.toFixed(1)}). Median (${stat.median.toFixed(2)}) is more representative than mean (${stat.mean.toFixed(2)}).`
      } else {
        summary = `Mean = ${stat.mean.toFixed(2)}, Median = ${stat.median.toFixed(2)}, SD = ${stat.sd.toFixed(2)} across ${stat.n} observations.`
      }

      const summaryLanguage = isZeroInflated
        ? `Median ${col.name} is ${stat.median.toFixed(2)} — ${(zeroRate * 100).toFixed(0)}% have zero.`
        : `${col.name} averages ${stat.median.toFixed(2)}, ranging from ${stat.min.toFixed(2)} to ${stat.max.toFixed(2)}.`

      findings.push({
        type: 'descriptives',
        title: `${col.name}: ${isSkewed ? 'Skewed' : 'Symmetric'} distribution (n=${stat.n})`,
        summary,
        summaryLanguage,
        detail: JSON.stringify(stat),
        significant: false,
        pValue: null,
        effectSize: null,
        effectLabel: null,
        theme: null,
      })
    }

    const result: DescriptivesResult = { stats: allStats }

    return {
      pluginId: 'descriptives',
      data: { result },
      charts,
      findings,
      plainLanguage: this.plainLanguage({
        pluginId: 'descriptives', data: { result }, charts: [], findings: [],
        plainLanguage: '', assumptions: [], logEntry: {},
      }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'descriptives', nVars: allStats.length } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: DescriptivesResult }).result
    if (!r || r.stats.length === 0) return 'No descriptive statistics computed.'

    const parts: string[] = []
    for (const stat of r.stats) {
      if (stat.isZeroInflated) {
        parts.push(`${stat.columnName}: ${(stat.zeroRate * 100).toFixed(0)}% zeros, median = ${stat.median.toFixed(2)}`)
      } else if (stat.isSkewed) {
        parts.push(`${stat.columnName}: skewed (median = ${stat.median.toFixed(2)}, mean = ${stat.mean.toFixed(2)})`)
      } else {
        parts.push(`${stat.columnName}: mean = ${stat.mean.toFixed(2)}, SD = ${stat.sd.toFixed(2)}`)
      }
    }
    return parts.join('. ') + '.'
  },
}

AnalysisRegistry.register(DescriptivesPlugin)
export { DescriptivesPlugin }
