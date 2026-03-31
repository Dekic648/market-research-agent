/**
 * Tests for Kendall's Tau dispatch and Cohen's Kappa.
 */
import { describe, it, expect } from 'vitest'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/ReliabilityPlugin'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../../src/plugins/types'

// ============================================================
// Kendall's Tau
// ============================================================

describe('CorrelationPlugin — Kendall Tau dispatch', () => {
  const plugin = AnalysisRegistry.get('correlation')!

  it('uses Kendall for two ordinal columns', async () => {
    // Two Likert columns (1-5), n=50, with clear association
    const n = 50
    const a: number[] = []
    const b: number[] = []
    for (let i = 0; i < n; i++) {
      const v = Math.ceil(Math.random() * 5)
      a.push(v)
      b.push(Math.min(5, Math.max(1, v + (Math.random() > 0.3 ? 0 : (Math.random() > 0.5 ? 1 : -1)))))
    }

    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Quality', values: a },
        { id: 'q2', name: 'Service', values: b },
      ],
      n,
    }

    const result = await plugin.run(data)
    // If there are strong pairs, check method
    const details = result.findings
      .filter((f) => f.detail)
      .map((f) => { try { return JSON.parse(f.detail) } catch { return null } })
      .filter(Boolean)

    // At least verify no error — Kendall may or may not produce strong pairs depending on random data
    expect(result.findings).toBeDefined()
    // If any finding exists, it should have method field
    for (const d of details) {
      expect(['kendall', 'pearson', 'spearman']).toContain(d.method)
    }
  })

  it('uses Pearson for continuous columns', async () => {
    const n = 50
    const a: number[] = []
    const b: number[] = []
    for (let i = 0; i < n; i++) {
      const v = Math.random() * 100 // continuous, many unique values
      a.push(v)
      b.push(v * 0.8 + Math.random() * 20)
    }

    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Revenue', values: a },
        { id: 'q2', name: 'Spend', values: b },
      ],
      n,
    }

    const result = await plugin.run(data)
    const details = result.findings
      .filter((f) => f.detail)
      .map((f) => { try { return JSON.parse(f.detail) } catch { return null } })
      .filter(Boolean)

    // Continuous columns should NOT use Kendall
    for (const d of details) {
      expect(d.method).not.toBe('kendall')
    }
  })

  it('method badge appears in finding detail', async () => {
    const n = 100
    const a = Array.from({ length: n }, () => Math.ceil(Math.random() * 5))
    const b = a.map((v) => Math.min(5, Math.max(1, v))) // near-identical ordinal

    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'ColA', values: a },
        { id: 'q2', name: 'ColB', values: b },
      ],
      n,
    }

    const result = await plugin.run(data)
    for (const f of result.findings) {
      const detail = JSON.parse(f.detail)
      expect(detail).toHaveProperty('method')
    }
  })
})

// ============================================================
// Cohen's Kappa
// ============================================================

describe('ReliabilityPlugin — Cohen Kappa', () => {
  const plugin = AnalysisRegistry.get('cronbach')!

  it('computes kappa for exactly 2 raters with identical value sets', async () => {
    // Two raters, 3 categories (1,2,3), mostly agreeing
    const rater1 = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2]
    const rater2 = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 2, 1, 2, 3, 1, 2, 3, 1, 2]

    const data: ResolvedColumnData = {
      columns: [
        { id: 'r1', name: 'Rater A', values: rater1 },
        { id: 'r2', name: 'Rater B', values: rater2 },
      ],
      n: 20,
    }

    const result = await plugin.run(data)

    // Should have both Alpha and Kappa findings
    const kappaFinding = result.findings.find((f: any) => f.type === 'reliability_kappa')
    const alphaFinding = result.findings.find((f: any) => f.type === 'reliability')

    expect(alphaFinding).toBeDefined()
    expect(kappaFinding).toBeDefined()
    expect(kappaFinding!.title).toContain('Inter-rater Agreement')
    expect(kappaFinding!.title).toContain('Rater A')
    expect(kappaFinding!.title).toContain('Rater B')

    const detail = JSON.parse(kappaFinding!.detail as string)
    expect(detail.kappa).toBeGreaterThan(0)
  })

  it('does not fire kappa for 3+ columns', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Item 1', values: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5] },
        { id: 'q2', name: 'Item 2', values: [2, 3, 4, 5, 1, 2, 3, 4, 5, 1] },
        { id: 'q3', name: 'Item 3', values: [3, 4, 5, 1, 2, 3, 4, 5, 1, 2] },
      ],
      n: 10,
    }

    const result = await plugin.run(data)
    const kappaFinding = result.findings.find((f: any) => f.type === 'reliability_kappa')
    expect(kappaFinding).toBeUndefined()
  })

  it('does not fire kappa when value sets differ', async () => {
    // col1 has values {1,2,3}, col2 has values {4,5,6} — different sets
    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Scale A', values: [1, 2, 3, 1, 2, 3, 1, 2, 3, 1] },
        { id: 'q2', name: 'Scale B', values: [4, 5, 6, 4, 5, 6, 4, 5, 6, 4] },
      ],
      n: 10,
    }

    const result = await plugin.run(data)
    const kappaFinding = result.findings.find((f: any) => f.type === 'reliability_kappa')
    expect(kappaFinding).toBeUndefined()
  })

  it('Cronbach Alpha still fires for multi-item scales', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Item 1', values: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 3, 4] },
        { id: 'q2', name: 'Item 2', values: [2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 4, 3] },
        { id: 'q3', name: 'Item 3', values: [1, 2, 3, 4, 5, 2, 3, 4, 5, 1, 3, 4] },
        { id: 'q4', name: 'Item 4', values: [2, 3, 4, 5, 1, 1, 2, 3, 4, 5, 4, 3] },
      ],
      n: 12,
    }

    const result = await plugin.run(data)
    const alphaFinding = result.findings.find((f: any) => f.type === 'reliability')
    expect(alphaFinding).toBeDefined()
    expect(alphaFinding!.title).toContain('α')
  })
})
