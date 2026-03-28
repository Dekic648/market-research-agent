/**
 * FrequencyPlugin — distribution analysis for categorical/ordinal data.
 *
 * Produces: counts, percentages, Top2Box, Bottom2Box, net score.
 * Charts: divergingStackedBar, horizontalBar.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import type {
  AnalysisPlugin,
  PluginStepResult,
  ResolvedColumnData,
  ResolvedColumn,
  OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

// ============================================================
// Result types
// ============================================================

interface FrequencyItem {
  value: string | number
  count: number
  pct: number
}

interface ColumnFrequency {
  columnId: string
  columnName: string
  items: FrequencyItem[]
  n: number
  nMissing: number
  top2box: number      // % in top 2 values
  bot2box: number      // % in bottom 2 values
  netScore: number     // top2box - bot2box
  mean: number | null
  median: number | null
}

// ============================================================
// Core computation
// ============================================================

function computeFrequency(col: ResolvedColumn): ColumnFrequency {
  const counts = new Map<string | number, number>()
  let nMissing = 0
  const nums: number[] = []

  for (const v of col.values) {
    if (v === null || v === undefined) {
      nMissing++
      continue
    }
    counts.set(v, (counts.get(v) ?? 0) + 1)
    if (typeof v === 'number') nums.push(v)
    else {
      const n = parseFloat(String(v))
      if (!isNaN(n)) nums.push(n)
    }
  }

  const valid = col.values.length - nMissing
  const items: FrequencyItem[] = Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      count,
      pct: valid > 0 ? (count / valid) * 100 : 0,
    }))
    .sort((a, b) => {
      // Sort numerically if possible, else alphabetically
      const aNum = typeof a.value === 'number' ? a.value : parseFloat(String(a.value))
      const bNum = typeof b.value === 'number' ? b.value : parseFloat(String(b.value))
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum
      return String(a.value).localeCompare(String(b.value))
    })

  // Top2Box / Bot2Box — for ordinal data with numeric values
  let top2box = 0
  let bot2box = 0
  if (items.length >= 3 && nums.length > 0) {
    const sortedItems = [...items].filter((it) => {
      const n = typeof it.value === 'number' ? it.value : parseFloat(String(it.value))
      return !isNaN(n)
    })
    if (sortedItems.length >= 3) {
      const top2 = sortedItems.slice(-2)
      const bot2 = sortedItems.slice(0, 2)
      top2box = top2.reduce((s, it) => s + it.pct, 0)
      bot2box = bot2.reduce((s, it) => s + it.pct, 0)
    }
  }

  // Mean and median
  let mean: number | null = null
  let median: number | null = null
  if (nums.length > 0) {
    mean = nums.reduce((s, n) => s + n, 0) / nums.length
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  return {
    columnId: col.id,
    columnName: col.name,
    items,
    n: valid,
    nMissing,
    top2box,
    bot2box,
    netScore: top2box - bot2box,
    mean,
    median,
  }
}

// ============================================================
// Chart builders
// ============================================================

function buildHorizontalBarChart(freq: ColumnFrequency): ChartConfig {
  return {
    id: `frequency_bar_${freq.columnId}_${Date.now()}`,
    type: 'horizontalBar',
    data: [
      {
        y: freq.items.map((it) => String(it.value)),
        x: freq.items.map((it) => it.pct),
        type: 'bar',
        orientation: 'h',
        marker: { color: brandColors[0] },
        text: freq.items.map((it) => `${it.pct.toFixed(1)}%`),
        textposition: 'outside',
      },
    ],
    layout: {
      ...baseLayout,
      title: { text: freq.columnName },
      xaxis: { title: { text: '%' }, range: [0, 100] },
      yaxis: { automargin: true },
    },
    config: baseConfig,
    stepId: 'frequency',
    edits: {},
  }
}

function buildDivergingStackedBar(
  frequencies: ColumnFrequency[]
): ChartConfig | null {
  // Only for ordinal data with numeric scale points
  const numericFreqs = frequencies.filter(
    (f) => f.items.length >= 3 && f.items.every((it) => !isNaN(Number(it.value)))
  )
  if (numericFreqs.length === 0) return null

  // Get unique scale points across all columns
  const allValues = new Set<number>()
  for (const f of numericFreqs) {
    for (const it of f.items) allValues.add(Number(it.value))
  }
  const scalePoints = Array.from(allValues).sort((a, b) => a - b)
  if (scalePoints.length < 3) return null

  const midIdx = Math.floor(scalePoints.length / 2)
  const negativeColors = ['#e24b4a', '#f09595']
  const neutralColor = '#d3d1c7'
  const positiveColors = ['#9fe1cb', '#1d9e75']

  const traces: unknown[] = scalePoints.map((sp, i) => {
    let color: string
    if (i < midIdx) color = negativeColors[Math.min(i, negativeColors.length - 1)]
    else if (i === midIdx && scalePoints.length % 2 !== 0) color = neutralColor
    else color = positiveColors[Math.min(i - midIdx - (scalePoints.length % 2 === 0 ? 0 : 1), positiveColors.length - 1)]

    return {
      name: String(sp),
      type: 'bar',
      orientation: 'h',
      y: numericFreqs.map((f) => f.columnName),
      x: numericFreqs.map((f) => {
        const item = f.items.find((it) => Number(it.value) === sp)
        const pct = item?.pct ?? 0
        return i < midIdx ? -pct : pct
      }),
      marker: { color },
      text: numericFreqs.map((f) => {
        const item = f.items.find((it) => Number(it.value) === sp)
        return item ? `${item.pct.toFixed(0)}%` : ''
      }),
      textposition: 'inside',
    }
  })

  return {
    id: `frequency_diverging_${Date.now()}`,
    type: 'divergingStackedBar',
    data: traces,
    layout: {
      ...baseLayout,
      barmode: 'relative',
      title: { text: 'Distribution' },
      xaxis: { title: { text: '%' }, zeroline: true },
      yaxis: { automargin: true },
    },
    config: baseConfig,
    stepId: 'frequency',
    edits: {},
  }
}

// ============================================================
// Plugin definition
// ============================================================

const FrequencyPlugin: AnalysisPlugin = {
  id: 'frequency',
  title: 'Frequency Distribution',
  desc: 'Distribution analysis with Top2/Bot2 box scores and net score.',
  priority: 10,
  reportPriority: 1,

  requires: ['ordinal'],
  preconditions: [],

  produces: {
    description: 'Frequency counts, percentages, Top2Box, Bot2Box, net score per column',
    fields: {
      frequencies: 'ColumnFrequency[]',
    },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    const frequencies = data.columns.map(computeFrequency)

    const charts: ChartConfig[] = []

    // Individual bar charts
    for (const freq of frequencies) {
      charts.push(buildHorizontalBarChart(freq))
    }

    // Diverging stacked bar if multiple ordinal columns
    if (frequencies.length >= 2) {
      const diverging = buildDivergingStackedBar(frequencies)
      if (diverging) charts.unshift(diverging)
    }

    // Generate findings
    const findings = frequencies.map((freq) => ({
      type: 'frequency',
      title: `${freq.columnName} Distribution`,
      summary: freq.mean !== null
        ? `Mean = ${freq.mean.toFixed(2)}, n = ${freq.n}. Top 2 Box = ${freq.top2box.toFixed(1)}%, Net Score = ${freq.netScore > 0 ? '+' : ''}${freq.netScore.toFixed(1)}pp.`
        : `${freq.n} responses across ${freq.items.length} categories. Mode: "${freq.items[0]?.value}" (${freq.items[0]?.pct.toFixed(1)}%).`,
      detail: JSON.stringify(freq.items),
      significant: false,
      pValue: null,
      effectSize: null,
      effectLabel: null,
      theme: null,
    }))

    const result: PluginStepResult = {
      pluginId: 'frequency',
      data: { frequencies },
      charts,
      findings,
      plainLanguage: this.plainLanguage({ pluginId: 'frequency', data: { frequencies }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'frequency', nColumns: frequencies.length } },
    }

    return result
  },

  plainLanguage(result: PluginStepResult): string {
    const freqs = (result.data as { frequencies: ColumnFrequency[] }).frequencies
    if (!freqs || freqs.length === 0) return 'No data to analyze.'

    if (freqs.length === 1) {
      const f = freqs[0]
      const top = f.items[0]
      const second = f.items.length > 1 ? f.items[1] : null
      if (top) {
        const topStr = `Most respondents chose "${top.value}" (${top.pct.toFixed(1)}%).`
        const secondStr = second ? ` "${second.value}" was the next most common at ${second.pct.toFixed(1)}%.` : ''
        return `${f.columnName}: ${topStr}${secondStr}`
      }
      return `${f.columnName}: ${f.n} responses across ${f.items.length} categories.`
    }

    const bestItem = freqs.reduce((best, f) => (f.top2box > best.top2box ? f : best))
    const worstItem = freqs.reduce((worst, f) => (f.top2box < worst.top2box ? f : worst))
    return `"${bestItem.columnName}" is the highest rated item (${bestItem.top2box.toFixed(0)}% positive). "${worstItem.columnName}" is the lowest rated (${worstItem.top2box.toFixed(0)}% positive).`
  },
}

AnalysisRegistry.register(FrequencyPlugin)
export { FrequencyPlugin }
