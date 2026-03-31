/**
 * Tests for ABTestPlugin and ClusteringPlugin.
 */
import { describe, it, expect } from 'vitest'
import '../../src/plugins/ABTestPlugin'
import '../../src/plugins/ClusteringPlugin'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../../src/plugins/types'

// ============================================================
// ABTestPlugin
// ============================================================

describe('ABTestPlugin', () => {
  const plugin = AnalysisRegistry.get('abtest')!

  it('fires for binary segment × numeric outcome', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 1, 2, 1, 5, 5, 4, 5, 4] }],
      segment: { id: 'seg', name: 'Group', values: ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B'] },
      n: 10,
    }

    const result = await plugin.run(data)
    expect(result.findings.length).toBeGreaterThanOrEqual(1)
    expect(result.findings[0].type).toBe('abtest')
    expect(result.findings[0].title).toContain('A vs B')
  })

  it('does not fire for 3-group segment', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2] }],
      segment: { id: 'seg', name: 'Group', values: ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'C'] },
      n: 12,
    }

    const result = await plugin.run(data)
    expect(result.findings).toHaveLength(0)
  })

  it('includes lift and cohensD in finding detail', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Score', values: [1, 1, 2, 1, 2, 5, 5, 4, 5, 5] }],
      segment: { id: 'seg', name: 'Type', values: ['Low', 'Low', 'Low', 'Low', 'Low', 'High', 'High', 'High', 'High', 'High'] },
      n: 10,
    }

    const result = await plugin.run(data)
    const detail = JSON.parse(result.findings[0].detail as string)
    expect(detail.cohensD).toBeDefined()
    expect(detail.lift).toBeDefined()
    expect(typeof detail.lift).toBe('number')
  })
})

// ============================================================
// ClusteringPlugin
// ============================================================

describe('ClusteringPlugin', () => {
  const plugin = AnalysisRegistry.get('cluster_analysis')!

  it('produces cluster findings for 4 columns, 50 respondents', async () => {
    const n = 50
    const cols = Array.from({ length: 4 }, (_, ci) => ({
      id: `c${ci}`,
      name: `Var_${ci + 1}`,
      values: Array.from({ length: n }, () => Math.floor(Math.random() * 5) + 1),
    }))

    const data: ResolvedColumnData = { columns: cols, n }
    const result = await plugin.run(data)

    // Should have summary + per-cluster findings
    const summary = result.findings.find((f: any) => f.type === 'cluster_summary')
    const profiles = result.findings.filter((f: any) => f.type === 'cluster_profile')

    expect(summary).toBeDefined()
    expect(profiles.length).toBeGreaterThanOrEqual(2)
    expect(profiles.length).toBeLessThanOrEqual(6)

    // Summary should mention cluster count
    const detail = JSON.parse(summary!.detail as string)
    expect(detail.optimalK).toBeGreaterThanOrEqual(2)
    expect(detail.optimalK).toBeLessThanOrEqual(6)
  })

  it('emits warning for fewer than 20 complete cases', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'c1', name: 'A', values: [1, 2, 3, null, null, null, null, null, null, null] },
        { id: 'c2', name: 'B', values: [1, 2, 3, null, null, null, null, null, null, null] },
        { id: 'c3', name: 'C', values: [1, 2, 3, null, null, null, null, null, null, null] },
      ],
      n: 10,
    }

    const result = await plugin.run(data)
    const warning = result.findings.find((f: any) => f.type === 'cluster_warning')
    expect(warning).toBeDefined()
    expect(warning!.title).toContain('Too few')
  })

  it('emits warning for fewer than 3 columns', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'c1', name: 'A', values: Array.from({ length: 30 }, () => Math.random() * 5) },
        { id: 'c2', name: 'B', values: Array.from({ length: 30 }, () => Math.random() * 5) },
      ],
      n: 30,
    }

    const result = await plugin.run(data)
    const warning = result.findings.find((f: any) => f.type === 'cluster_warning')
    expect(warning).toBeDefined()
    expect(warning!.title).toContain('at least 3')
  })

  it('z-scoring produces mean ≈ 0 and sd ≈ 1', () => {
    const values = [10, 20, 30, 40, 50]
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
    const sd = Math.sqrt(variance)
    const z = values.map((v) => (v - mean) / sd)

    const zMean = z.reduce((s, v) => s + v, 0) / z.length
    const zVariance = z.reduce((s, v) => s + (v - zMean) ** 2, 0) / (z.length - 1)
    const zSd = Math.sqrt(zVariance)

    expect(zMean).toBeCloseTo(0, 10)
    expect(zSd).toBeCloseTo(1, 10)
  })

  it('cluster profile summaryLanguage names top deviating columns', async () => {
    const n = 60
    // Create columns where clusters will form naturally
    const cols = Array.from({ length: 4 }, (_, ci) => ({
      id: `c${ci}`,
      name: `Feature_${ci + 1}`,
      values: Array.from({ length: n }, (_, ri) => {
        // First half scores high on first 2 features, low on last 2
        if (ri < n / 2) return ci < 2 ? 4 + Math.random() : 1 + Math.random()
        return ci < 2 ? 1 + Math.random() : 4 + Math.random()
      }),
    }))

    const data: ResolvedColumnData = { columns: cols, n }
    const result = await plugin.run(data)

    const profiles = result.findings.filter((f: any) => f.type === 'cluster_profile')
    for (const p of profiles) {
      // summaryLanguage should mention feature names
      expect(p.summaryLanguage).toMatch(/Feature_/)
      expect(p.summaryLanguage).toMatch(/high|low/)
    }
  })
})
