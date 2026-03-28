/**
 * SegmentProfilePlugin — per-segment profiles vs overall average.
 *
 * For normal data: shows means (existing behavior).
 * For skewed/zero-inflated data: leads with median and non-zero rate.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface ColumnProfile {
  column: string
  mean: number
  median: number
  sd: number
  vsAverage: number
  nonZeroRate?: number
}

interface SegmentProfile {
  segment: string | number
  n: number
  means: ColumnProfile[]
}

interface SegmentProfileResult {
  profiles: SegmentProfile[]
  overallMeans: Array<{ column: string; mean: number; median: number; nonZeroRate?: number }>
  columnNames: string[]
  skewedColumns: string[]
  zeroInflatedColumns: string[]
}

function computeStats(nums: number[]): { mean: number; median: number; sd: number; nonZeroRate: number; skewness: number } {
  if (nums.length === 0) return { mean: 0, median: 0, sd: 0, nonZeroRate: 0, skewness: 0 }
  const sorted = [...nums].sort((a, b) => a - b)
  const mean = nums.reduce((s, v) => s + v, 0) / nums.length
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]
  const variance = nums.reduce((s, v) => s + (v - mean) ** 2, 0) / (nums.length - 1 || 1)
  const sd = Math.sqrt(variance)
  const nonZeroRate = nums.filter((v) => v !== 0).length / nums.length
  // @ts-ignore
  const skewness = nums.length >= 3 ? (StatsEngine._helpers.skewness(nums) as number) : 0
  return { mean, median, sd, nonZeroRate, skewness }
}

function buildRadarChart(result: SegmentProfileResult): ChartConfig {
  // For skewed data, use median; otherwise mean
  const useMedian = result.skewedColumns.length > 0 || result.zeroInflatedColumns.length > 0
  const valueKey = useMedian ? 'median' : 'mean'

  const traces = result.profiles.map((profile, i) => ({
    type: 'scatterpolar',
    r: [...profile.means.map((m) => m[valueKey]), profile.means[0]?.[valueKey] ?? 0],
    theta: [...result.columnNames, result.columnNames[0] ?? ''],
    name: String(profile.segment),
    fill: 'toself',
    opacity: 0.6,
    line: { color: brandColors[i % brandColors.length] },
  }))

  const overallValues = result.overallMeans.map((m) => useMedian ? m.median : m.mean)
  traces.push({
    type: 'scatterpolar',
    r: [...overallValues, overallValues[0] ?? 0],
    theta: [...result.columnNames, result.columnNames[0] ?? ''],
    name: 'Overall',
    fill: 'none',
    opacity: 1,
    line: { color: '#2c2c2a', dash: 'dash' } as any,
  })

  return {
    id: `segment_radar_${Date.now()}`,
    type: 'radarChart',
    data: traces,
    layout: {
      ...baseLayout,
      title: { text: `Segment Profiles (${useMedian ? 'Median' : 'Mean'})` },
      polar: { radialaxis: { visible: true } },
      showlegend: true,
    },
    config: baseConfig,
    stepId: 'segment_profile',
    edits: {},
  }
}

function buildProfileBar(result: SegmentProfileResult): ChartConfig {
  const useMedian = result.skewedColumns.length > 0 || result.zeroInflatedColumns.length > 0
  const valueKey = useMedian ? 'median' : 'mean'

  const traces = result.profiles.map((profile, i) => ({
    name: String(profile.segment),
    type: 'bar',
    x: result.columnNames,
    y: profile.means.map((m) => m[valueKey]),
    marker: { color: brandColors[i % brandColors.length] },
  }))

  return {
    id: `segment_bar_${Date.now()}`,
    type: 'groupedBar',
    data: traces,
    layout: {
      ...baseLayout,
      barmode: 'group',
      title: { text: `Segment ${useMedian ? 'Medians' : 'Means'} by Variable` },
      yaxis: { title: { text: useMedian ? 'Median' : 'Mean' } },
    },
    config: baseConfig,
    stepId: 'segment_profile',
    edits: {},
  }
}

const SegmentProfilePlugin: AnalysisPlugin = {
  id: 'segment_profile',
  title: 'Segment Profiles',
  desc: 'Per-segment profiles compared to overall average. Uses median for skewed data.',
  priority: 90,
  reportPriority: 2,
  requires: ['ordinal', 'segment'],
  preconditions: [],
  produces: { description: 'Per-segment profiles with skew-aware metrics', fields: { result: 'SegmentProfileResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (!data.segment) throw new Error('SegmentProfilePlugin requires a segment column')

    // Compute overall stats per column and detect skew/zero-inflation
    const skewedColumns: string[] = []
    const zeroInflatedColumns: string[] = []

    const overallMeans = data.columns.map((col) => {
      const nums = col.values.filter((v) => v !== null).map((v) => typeof v === 'number' ? v : parseFloat(String(v))).filter((n) => !isNaN(n))
      const stats = computeStats(nums)
      if (Math.abs(stats.skewness) > 1.5) skewedColumns.push(col.name)
      if (stats.nonZeroRate < 0.9) zeroInflatedColumns.push(col.name)
      return {
        column: col.name,
        mean: stats.mean,
        median: stats.median,
        nonZeroRate: zeroInflatedColumns.includes(col.name) ? stats.nonZeroRate : undefined,
      }
    })

    // Group by segment
    const segGroups = new Map<string | number, Map<string, number[]>>()
    const segCounts = new Map<string | number, number>()

    for (let i = 0; i < data.segment.values.length; i++) {
      const seg = data.segment.values[i]
      if (seg === null) continue
      if (!segGroups.has(seg)) {
        segGroups.set(seg, new Map())
        segCounts.set(seg, 0)
      }
      segCounts.set(seg, (segCounts.get(seg) ?? 0) + 1)

      for (const col of data.columns) {
        const v = col.values[i]
        if (v === null) continue
        const n = typeof v === 'number' ? v : parseFloat(String(v))
        if (isNaN(n)) continue
        const group = segGroups.get(seg)!
        if (!group.has(col.name)) group.set(col.name, [])
        group.get(col.name)!.push(n)
      }
    }

    const profiles: SegmentProfile[] = Array.from(segGroups.entries()).map(([seg, colMap]) => ({
      segment: seg,
      n: segCounts.get(seg) ?? 0,
      means: data.columns.map((col) => {
        const vals = colMap.get(col.name) ?? []
        const stats = computeStats(vals)
        const overall = overallMeans.find((m) => m.column === col.name)
        const overallMean = overall?.mean ?? 0
        return {
          column: col.name,
          mean: stats.mean,
          median: stats.median,
          sd: stats.sd,
          vsAverage: overallMean > 0 ? ((stats.mean - overallMean) / overallMean) * 100 : 0,
          nonZeroRate: zeroInflatedColumns.includes(col.name) ? stats.nonZeroRate : undefined,
        }
      }),
    }))

    const result: SegmentProfileResult = {
      profiles,
      overallMeans,
      columnNames: data.columns.map((c) => c.name),
      skewedColumns,
      zeroInflatedColumns,
    }

    const charts = [buildRadarChart(result), buildProfileBar(result)]
    const hasSkewed = skewedColumns.length > 0 || zeroInflatedColumns.length > 0

    const findings = profiles.map((p) => {
      const maxDev = p.means.reduce((best, m) => Math.abs(m.vsAverage) > Math.abs(best.vsAverage) ? m : best)

      let summary: string
      if (zeroInflatedColumns.length > 0) {
        const ziCol = p.means.find((m) => m.nonZeroRate !== undefined)
        if (ziCol && ziCol.nonZeroRate !== undefined) {
          summary = `Conversion rate: ${(ziCol.nonZeroRate * 100).toFixed(0)}%. Median ${ziCol.column} = ${ziCol.median.toFixed(2)}. Largest deviation: ${maxDev.column} at ${maxDev.vsAverage > 0 ? '+' : ''}${maxDev.vsAverage.toFixed(1)}% vs average.`
        } else {
          summary = `Largest deviation: ${maxDev.column} at ${maxDev.vsAverage > 0 ? '+' : ''}${maxDev.vsAverage.toFixed(1)}% vs average.`
        }
      } else if (skewedColumns.length > 0) {
        summary = `Median shown — distribution is skewed. Largest deviation: ${maxDev.column} at ${maxDev.vsAverage > 0 ? '+' : ''}${maxDev.vsAverage.toFixed(1)}% vs average.`
      } else {
        summary = `Largest deviation: ${maxDev.column} at ${maxDev.vsAverage > 0 ? '+' : ''}${maxDev.vsAverage.toFixed(1)}% vs average.`
      }

      const sortedByMean = [...p.means].sort((a, b) => b.mean - a.mean)
      const highest = sortedByMean[0]
      const lowest = sortedByMean[sortedByMean.length - 1]
      const summaryLanguage = `${p.segment} leads on ${highest.column} (${highest.mean.toFixed(1)}), ${lowest.column} trails (${lowest.mean.toFixed(1)}).`

      return {
        type: 'segment_profile',
        title: `Segment "${p.segment}" (n=${p.n})`,
        summary,
        summaryLanguage,
        detail: JSON.stringify(p.means.slice(0, 5)),
        significant: false,
        pValue: null,
        effectSize: null,
        effectLabel: null,
        theme: null,
      }
    })

    return {
      pluginId: 'segment_profile', data: { result }, charts, findings,
      plainLanguage: this.plainLanguage({ pluginId: 'segment_profile', data: { result }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'segment_profile', nSegments: profiles.length, skewedColumns, zeroInflatedColumns } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: SegmentProfileResult }).result
    if (!r || r.profiles.length === 0) return 'No segment profiles.'

    const hasZI = r.zeroInflatedColumns.length > 0
    const hasSkew = r.skewedColumns.length > 0

    let bestSeg: { segment: string | number; variable: string; vsAverage: number; nonZeroRate?: number } | null = null
    for (const p of r.profiles) {
      for (const m of p.means) {
        if (!bestSeg || Math.abs(m.vsAverage) > Math.abs(bestSeg.vsAverage)) {
          bestSeg = { segment: p.segment, variable: m.column, vsAverage: m.vsAverage, nonZeroRate: m.nonZeroRate }
        }
      }
    }

    if (hasZI && bestSeg) {
      const overall = r.overallMeans.find((m) => m.column === bestSeg!.variable)
      const rateStr = bestSeg.nonZeroRate !== undefined ? ` (${(bestSeg.nonZeroRate * 100).toFixed(0)}% conversion rate)` : ''
      return `"${bestSeg.segment}" stands out for ${bestSeg.variable}${rateStr} (${bestSeg.vsAverage > 0 ? '+' : ''}${bestSeg.vsAverage.toFixed(0)}% vs average). Median shown — mean is sensitive to outliers in zero-inflated data. ${r.profiles.length} segments profiled.`
    }

    if (hasSkew && bestSeg) {
      return `"${bestSeg.segment}" stands out for ${bestSeg.variable} (${bestSeg.vsAverage > 0 ? '+' : ''}${bestSeg.vsAverage.toFixed(0)}% vs average). Median shown — distribution is skewed. Mean is sensitive to outliers. ${r.profiles.length} segments profiled.`
    }

    if (bestSeg && Math.abs(bestSeg.vsAverage) > 5) {
      const overall = r.overallMeans.find((m) => m.column === bestSeg!.variable)
      const overallStr = overall ? ` (vs overall mean of ${overall.mean.toFixed(1)})` : ''
      return `"${bestSeg.segment}" stands out for ${bestSeg.variable} (${bestSeg.vsAverage > 0 ? '+' : ''}${bestSeg.vsAverage.toFixed(0)}% vs average${overallStr}). ${r.profiles.length} segments profiled across ${r.columnNames.length} variables.`
    }
    return `All ${r.profiles.length} segments are relatively similar across the ${r.columnNames.length} variables measured.`
  },
}

AnalysisRegistry.register(SegmentProfilePlugin)
export { SegmentProfilePlugin }
