/**
 * SegmentProfilePlugin — per-segment mean profiles vs overall average.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface SegmentProfile {
  segment: string | number
  n: number
  means: Array<{ column: string; mean: number; vsAverage: number }>
}

interface SegmentProfileResult {
  profiles: SegmentProfile[]
  overallMeans: Array<{ column: string; mean: number }>
  columnNames: string[]
}

function buildRadarChart(result: SegmentProfileResult): ChartConfig {
  const traces = result.profiles.map((profile, i) => ({
    type: 'scatterpolar',
    r: [...profile.means.map((m) => m.mean), profile.means[0]?.mean ?? 0],
    theta: [...result.columnNames, result.columnNames[0] ?? ''],
    name: String(profile.segment),
    fill: 'toself',
    opacity: 0.6,
    line: { color: brandColors[i % brandColors.length] },
  }))

  // Add overall average
  traces.push({
    type: 'scatterpolar',
    r: [...result.overallMeans.map((m) => m.mean), result.overallMeans[0]?.mean ?? 0],
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
      title: { text: 'Segment Profiles' },
      polar: { radialaxis: { visible: true } },
      showlegend: true,
    },
    config: baseConfig,
    stepId: 'segment_profile',
    edits: {},
  }
}

function buildProfileBar(result: SegmentProfileResult): ChartConfig {
  const traces = result.profiles.map((profile, i) => ({
    name: String(profile.segment),
    type: 'bar',
    x: result.columnNames,
    y: profile.means.map((m) => m.mean),
    marker: { color: brandColors[i % brandColors.length] },
  }))

  return {
    id: `segment_bar_${Date.now()}`,
    type: 'groupedBar',
    data: traces,
    layout: {
      ...baseLayout,
      barmode: 'group',
      title: { text: 'Segment Means by Variable' },
      yaxis: { title: { text: 'Mean' } },
    },
    config: baseConfig,
    stepId: 'segment_profile',
    edits: {},
  }
}

const SegmentProfilePlugin: AnalysisPlugin = {
  id: 'segment_profile',
  title: 'Segment Profiles',
  desc: 'Per-segment mean profiles compared to overall average.',
  priority: 90,
  requires: ['ordinal', 'segment'],
  preconditions: [],
  produces: { description: 'Per-segment means vs overall', fields: { result: 'SegmentProfileResult' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (!data.segment) throw new Error('SegmentProfilePlugin requires a segment column')

    // Compute overall means
    const overallMeans = data.columns.map((col) => {
      const nums = col.values.filter((v) => v !== null).map((v) => typeof v === 'number' ? v : parseFloat(String(v))).filter((n) => !isNaN(n))
      return { column: col.name, mean: nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0 }
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
        const mean = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
        const overall = overallMeans.find((m) => m.column === col.name)?.mean ?? 0
        return { column: col.name, mean, vsAverage: overall > 0 ? ((mean - overall) / overall) * 100 : 0 }
      }),
    }))

    const result: SegmentProfileResult = {
      profiles,
      overallMeans,
      columnNames: data.columns.map((c) => c.name),
    }

    const charts = [buildRadarChart(result), buildProfileBar(result)]

    // Find segments that deviate most from average
    const findings = profiles.map((p) => {
      const maxDev = p.means.reduce((best, m) => Math.abs(m.vsAverage) > Math.abs(best.vsAverage) ? m : best)
      return {
        type: 'segment_profile',
        title: `Segment "${p.segment}" (n=${p.n})`,
        summary: `Largest deviation: ${maxDev.column} at ${maxDev.vsAverage > 0 ? '+' : ''}${maxDev.vsAverage.toFixed(1)}% vs average.`,
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
      plainLanguage: `${profiles.length} segment profiles across ${data.columns.length} variables.`,
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'segment_profile', nSegments: profiles.length } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: SegmentProfileResult }).result
    if (!r) return 'No segment profiles.'
    return `${r.profiles.length} segments profiled across ${r.columnNames.length} variables.`
  },
}

AnalysisRegistry.register(SegmentProfilePlugin)
export { SegmentProfilePlugin }
