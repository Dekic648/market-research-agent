/**
 * ClusteringPlugin — k-means clustering with automatic k selection.
 *
 * Input: all numeric non-segment, non-weight columns.
 * Z-scores columns before clustering (kMeans uses raw Euclidean distance).
 * Auto-detects optimal k via elbow method (second derivative).
 * Output: per-cluster profile findings + summary finding.
 */

import { AnalysisRegistry } from './AnalysisRegistry'
import * as StatsEngine from '../engine/stats-engine'
import type {
  AnalysisPlugin, PluginStepResult, ResolvedColumnData, OutputContract,
} from './types'

/** Z-score a column: (value - mean) / sd */
function zScore(values: number[]): { z: number[]; mean: number; sd: number } {
  const n = values.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1 || 1)
  const sd = Math.sqrt(variance)
  const z = sd === 0 ? values.map(() => 0) : values.map((v) => (v - mean) / sd)
  return { z, mean, sd }
}

/** Detect optimal k via second derivative of withinSS */
function detectOptimalK(elbow: Array<{ k: number; withinSS: number }>): number {
  if (elbow.length < 3) return 2

  let maxSecondDeriv = -Infinity
  let bestIdx = 0

  for (let i = 1; i < elbow.length - 1; i++) {
    const secondDeriv = elbow[i - 1].withinSS - 2 * elbow[i].withinSS + elbow[i + 1].withinSS
    if (secondDeriv > maxSecondDeriv) {
      maxSecondDeriv = secondDeriv
      bestIdx = i
    }
  }

  const k = elbow[bestIdx].k
  return Math.max(2, Math.min(6, k))
}

const ClusteringPlugin: AnalysisPlugin = {
  id: 'cluster_analysis',
  title: 'Cluster Analysis (k-means)',
  desc: 'Discover natural groupings among respondents based on their response patterns.',
  priority: 95,
  reportPriority: 7,
  requires: ['continuous'],
  preconditions: [],
  produces: {
    description: 'k-means clusters with per-cluster profiles and summary',
    fields: { result: 'ClusterResult' },
  } satisfies OutputContract,

  async run(data: ResolvedColumnData): Promise<PluginStepResult> {
    // Minimum requirements
    if (data.columns.length < 3) {
      return {
        pluginId: 'cluster_analysis', data: {}, charts: [], findings: [{
          type: 'cluster_warning',
          title: 'Clustering requires at least 3 numeric columns',
          summary: `Only ${data.columns.length} column(s) available.`,
          summaryLanguage: 'Not enough variables for meaningful clustering.',
          detail: '{}', significant: false, pValue: null, effectSize: null,
          effectLabel: null, theme: null,
        }],
        plainLanguage: 'Clustering requires at least 3 numeric columns.',
        assumptions: [], logEntry: {},
      }
    }

    // Extract numeric values, filter to complete cases
    const items: number[][] = data.columns.map((col) =>
      col.values.map((v) => (v === null ? NaN : typeof v === 'number' ? v : parseFloat(String(v))))
    )

    const n = items[0].length
    const validRows: number[] = []
    for (let i = 0; i < n; i++) {
      if (items.every((item) => !isNaN(item[i]))) validRows.push(i)
    }

    if (validRows.length < 20) {
      return {
        pluginId: 'cluster_analysis', data: {}, charts: [], findings: [{
          type: 'cluster_warning',
          title: 'Too few complete cases for clustering',
          summary: `Only ${validRows.length} complete cases (minimum 20 required).`,
          summaryLanguage: 'Not enough complete responses for reliable clustering.',
          detail: '{}', significant: false, pValue: null, effectSize: null,
          effectLabel: null, theme: null,
        }],
        plainLanguage: 'Too few complete cases for clustering.',
        assumptions: [], logEntry: {},
      }
    }

    const filtered = items.map((item) => validRows.map((i) => item[i]))
    const colNames = data.columns.map((c) => c.name)

    // Z-score normalization
    const zStats = filtered.map(zScore)
    const zMatrix = zStats.map((s) => s.z)

    // Elbow method for optimal k
    // @ts-ignore
    const elbow = StatsEngine.elbowMethod(zMatrix, 8) as Array<{ k: number; withinSS: number }>
    const optimalK = detectOptimalK(elbow)

    // Run k-means
    // @ts-ignore
    const km = StatsEngine.kMeans(zMatrix, optimalK, { maxIter: 200 }) as any
    if (km.error) {
      return {
        pluginId: 'cluster_analysis', data: {}, charts: [], findings: [{
          type: 'cluster_warning', title: 'Clustering failed',
          summary: km.error, summaryLanguage: 'Clustering algorithm did not converge.',
          detail: '{}', significant: false, pValue: null, effectSize: null,
          effectLabel: null, theme: null,
        }],
        plainLanguage: 'Clustering failed.',
        assumptions: [], logEntry: {},
      }
    }

    const assignments: number[] = km.assignments
    const centroids: number[][] = km.centroids
    const clusterSizes: number[] = km.clusterSizes
    const totalN = validRows.length

    // Grand mean per column (in z-space = 0, but show raw)
    const grandMeans = zStats.map((s) => s.mean)

    // Per-cluster findings
    const findings: Array<Record<string, unknown>> = []

    for (let c = 0; c < optimalK; c++) {
      const size = clusterSizes[c]
      const pct = ((size / totalN) * 100).toFixed(0)

      // Top deviating columns (centroid distance from 0 in z-space)
      const deviations = colNames.map((name, ci) => ({
        name,
        zDev: centroids[c]?.[ci] ?? 0,
      })).sort((a, b) => Math.abs(b.zDev) - Math.abs(a.zDev))

      const top3 = deviations.slice(0, 3)
      const profileStr = top3
        .map((d) => `${d.name} (${d.zDev > 0 ? '+' : ''}${d.zDev.toFixed(1)} SD)`)
        .join(', ')

      const directionStr = top3
        .map((d) => `${d.zDev > 0 ? 'high' : 'low'} on ${d.name}`)
        .join(' and ')

      findings.push({
        type: 'cluster_profile',
        title: `Cluster ${c + 1} — ${size} respondents (${pct}%)`,
        summary: `Centroid deviations: ${profileStr}. ${km.converged ? 'Algorithm converged.' : 'Did not converge.'}`,
        summaryLanguage: `Cluster ${c + 1} scores ${directionStr}.`,
        detail: JSON.stringify({
          cluster: c, size, pct: parseFloat(pct),
          centroid: centroids[c],
          topDeviations: top3,
        }),
        significant: true,
        pValue: null,
        effectSize: null,
        effectLabel: null,
        theme: null,
      })
    }

    // Summary finding
    const largestCluster = clusterSizes.indexOf(Math.max(...clusterSizes))
    const largestPct = ((clusterSizes[largestCluster] / totalN) * 100).toFixed(0)

    findings.unshift({
      type: 'cluster_summary',
      title: `${optimalK}-cluster solution — ${km.totalWithinSS.toFixed(1)} total within-cluster SS`,
      summary: `${optimalK} clusters from ${totalN} complete cases across ${colNames.length} variables. ${km.converged ? 'Converged.' : 'Did not converge.'}`,
      summaryLanguage: `Respondents split into ${optimalK} distinct groups. Largest cluster: ${clusterSizes[largestCluster]} (${largestPct}%).`,
      detail: JSON.stringify({
        optimalK, totalN, nColumns: colNames.length,
        clusterSizes, totalWithinSS: km.totalWithinSS,
        betweenSS: km.betweenSS, converged: km.converged,
        elbow,
      }),
      significant: true,
      pValue: null,
      effectSize: km.betweenSS / km.totalSS, // ratio of explained variance
      effectLabel: null,
      theme: null,
    })

    return {
      pluginId: 'cluster_analysis',
      data: { assignments, centroids, optimalK, colNames, zStats: zStats.map((s) => ({ mean: s.mean, sd: s.sd })) },
      charts: [],
      findings: findings as any,
      plainLanguage: this.plainLanguage({
        pluginId: 'cluster_analysis',
        data: { optimalK, totalN: validRows.length, clusterSizes },
        charts: [], findings: [], plainLanguage: '', assumptions: [], logEntry: {},
      }),
      assumptions: [],
      logEntry: { type: 'analysis_run', payload: { pluginId: 'cluster_analysis', k: optimalK, n: validRows.length } },
    }
  },

  plainLanguage(res: PluginStepResult): string {
    const d = res.data as { optimalK?: number; totalN?: number; clusterSizes?: number[] }
    if (!d.optimalK) return 'No clustering results.'
    return `${d.optimalK} clusters identified from ${d.totalN} respondents. Cluster sizes: ${d.clusterSizes?.join(', ')}.`
  },
}

AnalysisRegistry.register(ClusteringPlugin)
export { ClusteringPlugin }
