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
import type { ChartConfig, NullMeaning } from '../types/dataTypes'

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
  topBox: number        // % in top values of the scale
  bottomBox: number     // % in bottom values of the scale
  topBoxLabel: string   // "Top 2 Box" or "Top Box" for 3-pt scales
  bottomBoxLabel: string
  netScore: number      // topBox - bottomBox
  /** @deprecated Use topBox */
  top2box: number
  /** @deprecated Use bottomBox */
  bot2box: number
  mean: number | null
  median: number | null
}

// ============================================================
// Core computation
// ============================================================

function computeFrequency(
  col: ResolvedColumn,
  nullMeaning: NullMeaning = 'missing',
  rowCount?: number,
  declaredScaleRange?: [number, number] | null
): ColumnFrequency {
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

  // Denominator depends on null meaning:
  // 'not_chosen': full sample (rowCount) — nulls are implicit "not selected"
  // 'not_asked':  non-null count — respondents who received the question
  // 'missing':    non-null count — current default behavior
  const nonNull = col.values.length - nMissing
  const valid = nullMeaning === 'not_chosen' && rowCount
    ? rowCount
    : nonNull
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

  // Top/Bottom Box — for ordinal data with numeric values
  // Uses declaredScaleRange if available, otherwise infers from actual values
  let topBox = 0
  let bottomBox = 0
  let topBoxLabel = 'Top 2 Box'
  let bottomBoxLabel = 'Bottom 2 Box'

  if (nums.length > 0) {
    const sortedItems = [...items].filter((it) => {
      const n = typeof it.value === 'number' ? it.value : parseFloat(String(it.value))
      return !isNaN(n)
    })

    if (sortedItems.length >= 2) {
      // Determine scale range — declared takes priority, then infer
      let scaleMin: number, scaleMax: number
      if (declaredScaleRange) {
        scaleMin = declaredScaleRange[0]
        scaleMax = declaredScaleRange[1]
      } else {
        scaleMin = Number(sortedItems[0].value)
        scaleMax = Number(sortedItems[sortedItems.length - 1].value)
      }
      const scalePoints = scaleMax - scaleMin + 1

      if (scalePoints <= 3) {
        // 3-point scale or smaller: single top/bottom box
        topBoxLabel = 'Top Box'
        bottomBoxLabel = 'Bottom Box'
        const topItems = sortedItems.filter((it) => Number(it.value) === scaleMax)
        const botItems = sortedItems.filter((it) => Number(it.value) === scaleMin)
        topBox = topItems.reduce((s, it) => s + it.pct, 0)
        bottomBox = botItems.reduce((s, it) => s + it.pct, 0)
      } else {
        // 4+ point scale: top 2 / bottom 2
        const topThreshold = scaleMax - 1
        const botThreshold = scaleMin + 1
        const topItems = sortedItems.filter((it) => Number(it.value) >= topThreshold)
        const botItems = sortedItems.filter((it) => Number(it.value) <= botThreshold)
        topBox = topItems.reduce((s, it) => s + it.pct, 0)
        bottomBox = botItems.reduce((s, it) => s + it.pct, 0)
      }
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
    topBox,
    bottomBox,
    topBoxLabel,
    bottomBoxLabel,
    netScore: topBox - bottomBox,
    top2box: topBox,
    bot2box: bottomBox,
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

function buildGroupedBarBySegment(
  col: ResolvedColumn,
  segment: ResolvedColumn,
  columnName: string
): ChartConfig {
  // Compute % per segment per response option
  const segGroups = new Map<string | number, Map<string | number, number>>()
  const segCounts = new Map<string | number, number>()

  for (let i = 0; i < col.values.length; i++) {
    const seg = segment.values[i]
    const val = col.values[i]
    if (seg === null || val === null) continue
    if (!segGroups.has(seg)) { segGroups.set(seg, new Map()); segCounts.set(seg, 0) }
    segCounts.set(seg, (segCounts.get(seg) ?? 0) + 1)
    const valMap = segGroups.get(seg)!
    valMap.set(val, (valMap.get(val) ?? 0) + 1)
  }

  // Get all unique response values sorted
  const allValues = new Set<string | number>()
  for (const [, valMap] of segGroups) {
    for (const v of valMap.keys()) allValues.add(v)
  }
  const sortedValues = Array.from(allValues).sort((a, b) => {
    const na = typeof a === 'number' ? a : parseFloat(String(a))
    const nb = typeof b === 'number' ? b : parseFloat(String(b))
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return String(a).localeCompare(String(b))
  })

  const segLabels = Array.from(segGroups.keys())
  const traces = segLabels.map((seg, i) => {
    const valMap = segGroups.get(seg)!
    const total = segCounts.get(seg) ?? 1
    return {
      name: String(seg),
      type: 'bar',
      x: sortedValues.map(String),
      y: sortedValues.map((v) => ((valMap.get(v) ?? 0) / total) * 100),
      marker: { color: brandColors[i % brandColors.length] },
    }
  })

  return {
    id: `freq_grouped_${col.id}_${Date.now()}`,
    type: 'groupedBar',
    data: traces,
    layout: {
      ...baseLayout,
      barmode: 'group',
      title: { text: `${columnName} — % by ${segment.name}` },
      yaxis: { title: { text: '% of segment' }, range: [0, 100] },
      xaxis: { title: { text: 'Response' } },
      showlegend: true,
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
    const frequencies = data.columns.map((col) =>
      computeFrequency(col, col.nullMeaning ?? 'missing', data.rowCount, (col as any).declaredScaleRange)
    )

    const charts: ChartConfig[] = []

    // Matrix/checkbox × segment enforcement: always grouped bar chart
    const hasSegment = !!data.segment
    const isMatrixOrCheckbox = data.columns.some((c) =>
      (c as any).format === 'matrix' || (c as any).format === 'multi_response'
    )

    if (hasSegment && isMatrixOrCheckbox && data.segment) {
      // Grouped bar chart per column showing % per segment
      for (const col of data.columns) {
        charts.push(buildGroupedBarBySegment(col, data.segment, col.name))
      }
    } else {
      // Default charts
      for (const freq of frequencies) {
        charts.push(buildHorizontalBarChart(freq))
      }

      // Diverging stacked bar if multiple ordinal columns
      if (frequencies.length >= 2) {
        const diverging = buildDivergingStackedBar(frequencies)
        if (diverging) charts.unshift(diverging)
      }
    }

    // Generate findings
    const findings = frequencies.map((freq) => {
      let summary: string
      if (freq.mean !== null && freq.topBox > 0) {
        const topNote = freq.topBox > 70 ? ' Strong positive rating.'
          : freq.topBox < 40 ? ' Below average — majority are not rating positively.'
          : ''
        const netNote = freq.netScore < 0 ? ' More negative than positive ratings overall.' : ''
        summary = `${freq.topBox.toFixed(0)}% rate ${freq.columnName} positively (${freq.topBoxLabel}). Net score: ${freq.netScore > 0 ? '+' : ''}${freq.netScore.toFixed(0)}pp.${topNote}${netNote} Mean = ${freq.mean.toFixed(2)}, n = ${freq.n}.`
      } else {
        summary = `${freq.n} responses across ${freq.items.length} categories. Mode: "${freq.items[0]?.value}" (${freq.items[0]?.pct.toFixed(1)}%).`
      }

      const strengthLabel = freq.topBox > 70 ? 'strong' : freq.topBox < 40 ? 'weak' : 'moderate'
      const summaryLanguage = freq.mean !== null && freq.topBox > 0
        ? `${freq.columnName} scores ${freq.topBox.toFixed(0)}% positive — ${strengthLabel}.`
        : `${freq.columnName} has ${freq.items.length} response categories, with "${freq.items[0]?.value}" chosen most often (${freq.items[0]?.pct.toFixed(0)}%).`

      return {
        type: 'frequency',
        title: `${freq.columnName} Distribution`,
        summary,
        summaryLanguage,
        detail: JSON.stringify(freq.items),
        significant: false,
        pValue: null,
        effectSize: null,
        effectLabel: null,
        theme: null,
      }
    })

    const columnNullMeanings = data.columns.map((c) => c.nullMeaning ?? 'missing')
    const result: PluginStepResult = {
      pluginId: 'frequency',
      data: { frequencies, columnNullMeanings },
      charts,
      findings,
      plainLanguage: this.plainLanguage({ pluginId: 'frequency', data: { frequencies, columnNullMeanings }, charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {} }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'frequency', nColumns: frequencies.length } },
    }

    return result
  },

  plainLanguage(result: PluginStepResult): string {
    const d = result.data as { frequencies: ColumnFrequency[]; columnNullMeanings?: string[] }
    const freqs = d.frequencies
    if (!freqs || freqs.length === 0) return 'No data to analyze.'
    const nullMeanings = d.columnNullMeanings ?? []
    const isNotAsked = nullMeanings[0] === 'not_asked'
    const basePrefix = isNotAsked ? `Among respondents who answered this question (n=${freqs[0]?.n ?? 0}), ` : ''

    if (freqs.length === 1) {
      const f = freqs[0]
      const top = f.items[0]
      const second = f.items.length > 1 ? f.items[1] : null
      if (top) {
        const topStr = `most chose "${top.value}" (${top.pct.toFixed(1)}%).`
        const secondStr = second ? ` "${second.value}" was the next most common at ${second.pct.toFixed(1)}%.` : ''
        return `${f.columnName}: ${basePrefix}${isNotAsked ? topStr : topStr.charAt(0).toUpperCase() + topStr.slice(1)}${secondStr}`
      }
      return `${f.columnName}: ${f.n} responses across ${f.items.length} categories.`
    }

    const bestItem = freqs.reduce((best, f) => (f.topBox > best.topBox ? f : best))
    const worstItem = freqs.reduce((worst, f) => (f.topBox < worst.topBox ? f : worst))
    return `${basePrefix}"${bestItem.columnName}" is the highest rated item (${bestItem.topBox.toFixed(0)}% positive). "${worstItem.columnName}" is the lowest rated (${worstItem.topBox.toFixed(0)}% positive).`
  },
}

AnalysisRegistry.register(FrequencyPlugin)
export { FrequencyPlugin }
