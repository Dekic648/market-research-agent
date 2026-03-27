/**
 * PointBiserialPlugin — binary × continuous correlation.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import { baseConfig, baseLayout, brandColors } from '../engine/chartDefaults'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'
import type { ChartConfig } from '../types/dataTypes'

interface PBResult {
  columnName: string
  binaryName: string
  r: number
  p: number
  mean0: number
  mean1: number
  n: number
}

function buildGroupMeansChart(results: PBResult[]): ChartConfig | null {
  if (results.length === 0) return null
  return {
    id: `pb_means_${Date.now()}`,
    type: 'groupedBar',
    data: [
      {
        name: 'Group 0',
        type: 'bar',
        x: results.map((r) => r.columnName),
        y: results.map((r) => r.mean0),
        marker: { color: brandColors[0] },
      },
      {
        name: 'Group 1',
        type: 'bar',
        x: results.map((r) => r.columnName),
        y: results.map((r) => r.mean1),
        marker: { color: brandColors[2] },
      },
    ],
    layout: {
      ...baseLayout,
      barmode: 'group',
      title: { text: `Means by ${results[0]?.binaryName ?? 'Group'}` },
      yaxis: { title: { text: 'Mean' } },
    },
    config: baseConfig,
    stepId: 'point_biserial',
    edits: {},
  }
}

const PointBiserialPlugin: AnalysisPlugin = {
  id: 'point_biserial',
  title: 'Point-Biserial Correlation',
  desc: 'Correlation between a binary variable and continuous variables.',
  priority: 85,
  requires: ['binary', 'continuous'],
  preconditions: [],
  produces: { description: 'Point-biserial r, p-value, group means', fields: { results: 'PBResult[]' } } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    // Find binary column(s) and continuous column(s)
    const binaryCols = data.columns.filter((col) => {
      const unique = new Set(col.values.filter((v) => v !== null))
      return unique.size === 2
    })
    const continuousCols = data.columns.filter((col) => {
      const unique = new Set(col.values.filter((v) => v !== null))
      return unique.size > 2
    })

    if (binaryCols.length === 0 || continuousCols.length === 0) {
      return { pluginId: 'point_biserial', data: { results: [] }, charts: [], findings: [], plainLanguage: 'No binary/continuous pairs found.', assumptions: [], logEntry: {} }
    }

    const results: PBResult[] = []

    for (const binCol of binaryCols) {
      const binVals = binCol.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
      for (const contCol of continuousCols) {
        const contVals = contCol.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
        // @ts-ignore
        const pb = StatsEngine.pointBiserial(binVals, contVals) as any
        if (pb.error) continue
        results.push({
          columnName: contCol.name,
          binaryName: binCol.name,
          r: pb.r ?? 0, p: pb.p ?? 1,
          mean0: pb.mean0 ?? 0, mean1: pb.mean1 ?? 0,
          n: pb.n ?? 0,
        })
      }
    }

    results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    const charts: ChartConfig[] = []
    const chart = buildGroupMeansChart(results)
    if (chart) charts.push(chart)

    const findings = results.filter((r) => r.p < 0.05).map((r) => ({
      type: 'point_biserial',
      title: `${r.columnName} × ${r.binaryName}: r = ${r.r.toFixed(3)}`,
      summary: `Group 0 mean = ${r.mean0.toFixed(2)}, Group 1 mean = ${r.mean1.toFixed(2)} (p ${r.p < 0.001 ? '< .001' : '= ' + r.p.toFixed(3)}).`,
      detail: JSON.stringify(r),
      significant: true,
      pValue: r.p,
      effectSize: r.r,
      effectLabel: Math.abs(r.r) > 0.5 ? 'large' : Math.abs(r.r) > 0.3 ? 'medium' : 'small',
      theme: null,
    }))

    return {
      pluginId: 'point_biserial', data: { results }, charts, findings,
      plainLanguage: `${results.filter((r) => r.p < 0.05).length} significant point-biserial correlation(s).`,
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'point_biserial', nPairs: results.length } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const r = (res.data as { results: PBResult[] }).results
    if (!r) return 'No point-biserial results.'
    return `${r.filter((x) => x.p < 0.05).length} significant binary-continuous correlation(s).`
  },
}

AnalysisRegistry.register(PointBiserialPlugin)
export { PointBiserialPlugin }
