/**
 * DescriptivesSummaryPlugin — "Table 1" summary of all survey ordinal columns.
 *
 * One row per column: Mean, Median, SD, Top Box%, Bottom Box%, Net.
 * Renders as a sortable data table + ranked Top Box bar chart.
 * Runs once per dataset (not per column) when 2+ ordinal columns exist.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface SummaryRow {
  columnId: string
  columnName: string
  mean: number
  median: number
  sd: number
  n: number
  topBox: number
  bottomBox: number
  netScore: number
  scaleRange: [number, number] | null
}

interface SummaryResult {
  rows: SummaryRow[]
}

function computeTopBottomBox(nums: number[], scaleRange?: [number, number] | null): { topBox: number; bottomBox: number } {
  if (nums.length === 0) return { topBox: 0, bottomBox: 0 }
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  if (sorted.length === 0) return { topBox: 0, bottomBox: 0 }

  let scaleMin: number, scaleMax: number
  if (scaleRange) {
    scaleMin = scaleRange[0]
    scaleMax = scaleRange[1]
  } else {
    scaleMin = sorted[0]
    scaleMax = sorted[sorted.length - 1]
  }
  const scalePoints = scaleMax - scaleMin + 1

  let topThreshold: number, botThreshold: number
  if (scalePoints <= 3) {
    topThreshold = scaleMax
    botThreshold = scaleMin
  } else {
    topThreshold = scaleMax - 1
    botThreshold = scaleMin + 1
  }

  const topCount = nums.filter((v) => v >= topThreshold).length
  const botCount = nums.filter((v) => v <= botThreshold).length
  return {
    topBox: (topCount / nums.length) * 100,
    bottomBox: (botCount / nums.length) * 100,
  }
}

function buildTopBoxChart(rows: SummaryRow[]): ChartConfig {
  const sorted = [...rows].sort((a, b) => b.topBox - a.topBox)
  return {
    id: `summary_topbox_${Date.now()}`,
    type: 'horizontalBar',
    data: [{
      y: sorted.map((r) => r.columnName),
      x: sorted.map((r) => r.topBox),
      type: 'bar',
      orientation: 'h',
      marker: {
        color: sorted.map((r) => r.topBox >= 70 ? '#1d9e75' : r.topBox < 40 ? '#e24b4a' : brandColors[0]),
      },
      text: sorted.map((r) => `${r.topBox.toFixed(0)}%`),
      textposition: 'outside',
    }],
    layout: {
      ...baseLayout,
      title: { text: 'Top Box % — All Questions Ranked' },
      xaxis: { title: { text: 'Top Box %' }, range: [0, 100] },
      yaxis: { automargin: true },
    },
    config: baseConfig,
    stepId: 'descriptives_summary',
    edits: {},
  }
}

const DescriptivesSummaryPlugin: AnalysisPlugin = {
  id: 'descriptives_summary',
  title: 'Summary Statistics Table',
  desc: 'Side-by-side comparison of all survey questions — means, medians, Top Box.',
  priority: 5,
  reportPriority: 0,
  requires: ['ordinal'],
  preconditions: [],
  produces: {
    description: 'Summary table with per-column descriptives and Top/Bottom Box',
    fields: { result: 'SummaryResult' },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    if (data.columns.length < 2) throw new Error('Summary requires at least 2 columns')

    const rows: SummaryRow[] = data.columns.map((col) => {
      const nums: number[] = []
      for (const v of col.values) {
        if (v === null) continue
        const n = typeof v === 'number' ? v : parseFloat(String(v))
        if (!isNaN(n)) nums.push(n)
      }

      // @ts-ignore
      const desc = StatsEngine.describe(nums) as Record<string, any>
      const scaleRange = (col as any).declaredScaleRange ?? null
      const { topBox, bottomBox } = computeTopBottomBox(nums, scaleRange)

      return {
        columnId: col.id,
        columnName: col.name,
        mean: desc.mean ?? 0,
        median: desc.median ?? 0,
        sd: desc.sd ?? 0,
        n: nums.length,
        topBox,
        bottomBox,
        netScore: topBox - bottomBox,
        scaleRange,
      }
    })

    const result: SummaryResult = { rows }
    const charts = [buildTopBoxChart(rows)]

    const bestRow = rows.reduce((best, r) => r.topBox > best.topBox ? r : best)
    const worstRow = rows.reduce((worst, r) => r.topBox < worst.topBox ? r : worst)
    const gap = bestRow.topBox - worstRow.topBox

    const findings = [{
      type: 'descriptives_summary',
      title: `${rows.length} questions compared — Top Box range: ${worstRow.topBox.toFixed(0)}% to ${bestRow.topBox.toFixed(0)}%`,
      summary: `${bestRow.columnName} scores highest (Top Box: ${bestRow.topBox.toFixed(0)}%, Mean: ${bestRow.mean.toFixed(1)}). ${worstRow.columnName} has the most room for improvement (Top Box: ${worstRow.topBox.toFixed(0)}%, Mean: ${worstRow.mean.toFixed(1)}).${gap > 20 ? ' There is a significant spread across questions — not all attributes are performing equally.' : ''}`,
      summaryLanguage: `${bestRow.columnName} scores highest (${bestRow.topBox.toFixed(0)}% positive). ${worstRow.columnName} has the most room for improvement (${worstRow.topBox.toFixed(0)}%).`,
      detail: JSON.stringify(rows),
      significant: false,
      pValue: null,
      effectSize: null,
      effectLabel: null,
      theme: null,
    }]

    return {
      pluginId: 'descriptives_summary',
      data: { result },
      charts,
      findings,
      plainLanguage: this.plainLanguage({
        pluginId: 'descriptives_summary', data: { result }, charts: [], findings: [],
        plainLanguage: '', assumptions: [], logEntry: {},
      }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'descriptives_summary', nColumns: rows.length } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { result: SummaryResult }).result
    if (!r || r.rows.length === 0) return 'No summary data.'
    const best = r.rows.reduce((b, row) => row.topBox > b.topBox ? row : b)
    const worst = r.rows.reduce((w, row) => row.topBox < w.topBox ? row : w)
    return `${best.columnName} scores highest (Top Box: ${best.topBox.toFixed(0)}%, Mean: ${best.mean.toFixed(1)}). ${worst.columnName} has the most room for improvement (Top Box: ${worst.topBox.toFixed(0)}%, Mean: ${worst.mean.toFixed(1)}).`
  },
}

AnalysisRegistry.register(DescriptivesSummaryPlugin)
export { DescriptivesSummaryPlugin }
