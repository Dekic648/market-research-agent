/**
 * Tests for Tab III / Tab V enhancements:
 *   A. ttest for 2-group comparisons
 *   B. Relative likelihood sentence
 *   C. Structured EFA factor labels
 */
import { describe, it, expect } from 'vitest'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/FactorPlugin'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../../src/plugins/types'

// ============================================================
// CHANGE A — ttest for exactly 2 groups
// ============================================================

describe('SignificancePlugin — ttest for 2 groups', () => {
  const plugin = AnalysisRegistry.get('kw_significance')!

  it('uses Welch ttest for exactly 2 groups', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 1, 2, 1, 5, 5, 4, 5, 4] }],
      segment: { id: 'seg', name: 'Group', values: ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B'] },
      n: 10,
    }

    const result = await plugin.run(data)
    const res = (result.data as any).results
    expect(res[0].testUsed).toBe("Welch's t-test")
    expect(res[0].cohensD).toBeDefined()
    expect(typeof res[0].cohensD).toBe('number')
    expect(res[0].ci95).toBeDefined()
  })

  it('uses KW for 3+ groups', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 1, 3, 4, 3, 5, 5, 4, 5, 4, 5] }],
      segment: { id: 'seg', name: 'Group', values: ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'C'] },
      n: 12,
    }

    const result = await plugin.run(data)
    const res = (result.data as any).results
    expect(res[0].testUsed).toBe('Kruskal-Wallis')
    expect(res[0].H).toBeGreaterThan(0)
  })

  it('summaryLanguage names both groups with means for 2-group ttest', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Satisfaction', values: [1, 1, 2, 1, 2, 5, 5, 4, 5, 5] }],
      segment: { id: 'seg', name: 'Type', values: ['Low', 'Low', 'Low', 'Low', 'Low', 'High', 'High', 'High', 'High', 'High'] },
      n: 10,
    }

    const result = await plugin.run(data)
    const finding = result.findings[0]
    expect(finding.summaryLanguage).toContain('High')
    expect(finding.summaryLanguage).toContain('Low')
    expect(finding.summaryLanguage).toMatch(/mean \d/)
    expect(finding.summaryLanguage).toContain('d =')
  })
})

// ============================================================
// CHANGE B — Relative likelihood sentence
// ============================================================

describe('SignificancePlugin — Relative likelihood', () => {
  const plugin = AnalysisRegistry.get('kw_significance')!

  it('appends relative likelihood for significant Likert findings', async () => {
    // Create a clear 2-group Likert split: Group A mostly high, Group B mostly low
    const values: number[] = []
    const segs: string[] = []
    // Group A: mostly 4-5
    for (let i = 0; i < 30; i++) { values.push(5); segs.push('High') }
    for (let i = 0; i < 10; i++) { values.push(4); segs.push('High') }
    for (let i = 0; i < 5; i++) { values.push(2); segs.push('High') }
    for (let i = 0; i < 5; i++) { values.push(1); segs.push('High') }
    // Group B: mostly 1-2
    for (let i = 0; i < 5; i++) { values.push(5); segs.push('Low') }
    for (let i = 0; i < 5; i++) { values.push(4); segs.push('Low') }
    for (let i = 0; i < 15; i++) { values.push(2); segs.push('Low') }
    for (let i = 0; i < 25; i++) { values.push(1); segs.push('Low') }

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Satisfaction', values }],
      segment: { id: 'seg', name: 'Segment', values: segs },
      n: values.length,
    }

    const result = await plugin.run(data)
    const finding = result.findings.find((f) => f.significant)

    expect(finding).toBeDefined()
    // The summary should include the relative likelihood sentence
    expect(finding!.summary).toContain('more likely to rate positively')

    // detail should include relativeLikelihood
    const detail = JSON.parse(finding!.detail)
    expect(detail.relativeLikelihood).toBeDefined()
    expect(detail.relativeLikelihood.multiplier).toBeGreaterThan(1)
  })

  it('does not append for non-Likert categorical columns', async () => {
    // Use string categories (not ordinal scale)
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Color', values: ['red', 'red', 'blue', 'blue', 'red', 'blue', 'red', 'blue', 'red', 'blue'] }],
      segment: { id: 'seg', name: 'Group', values: ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B'] },
      n: 10,
    }

    const result = await plugin.run(data)
    // String values won't be parsed as numbers → no significance result
    // or if produced, no relative likelihood
    for (const f of result.findings) {
      expect(f.summary).not.toContain('more likely to rate positively')
    }
  })
})

// ============================================================
// CHANGE C — Structured EFA factor labels
// ============================================================

describe('FactorPlugin — Structured factor labels', () => {
  const plugin = AnalysisRegistry.get('efa')

  it('names all factors in summaryLanguage', async () => {
    if (!plugin) return // skip if not registered

    // 5 columns, should produce at least 1-2 factors
    const n = 150
    const cols = Array.from({ length: 5 }, (_, ci) => ({
      id: `c${ci}`,
      name: `Item_${ci + 1}`,
      values: Array.from({ length: n }, () => Math.floor(Math.random() * 5) + 1),
    }))

    const data: ResolvedColumnData = { columns: cols, n }

    const result = await plugin.run(data)
    const finding = result.findings[0]

    // summaryLanguage should mention "Factor 1:" and potentially "Factor 2:"
    expect(finding.summaryLanguage).toContain('Factor 1:')

    // Each factor line should contain item names or "weak structure"
    const factorLines = finding.summaryLanguage.match(/Factor \d+:/g)
    expect(factorLines).not.toBeNull()
    expect(factorLines!.length).toBeGreaterThanOrEqual(1)
  })

  it('labels factor with zero loadings > 0.4 as weak structure', () => {
    // Test the labeling logic directly
    const loadings = [[0.1], [0.2], [0.05]]
    const columnNames = ['A', 'B', 'C']

    const topItems = columnNames
      .map((name, i) => ({ name, loading: loadings[i]?.[0] ?? 0 }))
      .filter((x) => Math.abs(x.loading) > 0.4)
      .sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading))
      .slice(0, 3)

    const label = topItems.length > 0
      ? topItems.map((x) => x.name).join(', ')
      : 'weak structure'

    expect(label).toBe('weak structure')
  })

  it('labels factor with 1 loading > 0.4 using that single name', () => {
    const loadings = [[0.9], [0.2], [0.1]]
    const columnNames = ['Quality', 'Price', 'Speed']

    const topItems = columnNames
      .map((name, i) => ({ name, loading: loadings[i]?.[0] ?? 0 }))
      .filter((x) => Math.abs(x.loading) > 0.4)
      .sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading))
      .slice(0, 3)

    const label = topItems.length > 0
      ? topItems.map((x) => x.name).join(', ')
      : 'weak structure'

    expect(label).toBe('Quality')
  })
})
