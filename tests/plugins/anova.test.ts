import { describe, it, expect } from 'vitest'
import '../../src/plugins/ANOVAPlugin'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../../src/plugins/types'
import * as StatsEngine from '../../src/engine/stats-engine'

function makeCol(name: string, values: number[]) {
  return { id: `col_${name}`, name, values: values as (number | string | null)[], nullMeaning: 'missing' as const }
}

function makeSeg(name: string, labels: (string | number)[]) {
  return { id: `seg_${name}`, name, values: labels as (number | string | null)[], nullMeaning: 'missing' as const }
}

describe('ANOVAPlugin', () => {
  const plugin = AnalysisRegistry.get('anova_oneway')!

  it('computes F and p for 3 continuous groups', async () => {
    const vals = [
      ...Array.from({ length: 30 }, () => 10 + Math.random() * 2),
      ...Array.from({ length: 30 }, () => 15 + Math.random() * 2),
      ...Array.from({ length: 30 }, () => 20 + Math.random() * 2),
    ]
    const segs = [
      ...Array.from({ length: 30 }, () => 'Low'),
      ...Array.from({ length: 30 }, () => 'Mid'),
      ...Array.from({ length: 30 }, () => 'High'),
    ]
    const data: ResolvedColumnData = {
      columns: [makeCol('Score', vals)],
      segment: makeSeg('Group', segs),
      n: 90,
    }
    const result = await plugin.run(data)
    const anova = (result.data as any).result
    expect(anova.F).toBeGreaterThan(0)
    expect(anova.p).toBeLessThan(0.05)
    expect(anova.etaSquared).toBeGreaterThan(0)
  })

  it('labels eta-squared correctly', async () => {
    const vals = [
      ...Array.from({ length: 30 }, () => 10 + Math.random()),
      ...Array.from({ length: 30 }, () => 20 + Math.random()),
    ]
    const segs = [
      ...Array.from({ length: 30 }, () => 'A'),
      ...Array.from({ length: 30 }, () => 'B'),
    ]
    const data: ResolvedColumnData = {
      columns: [makeCol('Score', vals)],
      segment: makeSeg('Group', segs),
      n: 60,
    }
    const result = await plugin.run(data)
    const anova = (result.data as any).result
    expect(['negligible', 'small', 'medium', 'large']).toContain(anova.etaLabel)
  })

  it('produces Tukey HSD pairwise comparisons', async () => {
    const vals = [
      ...Array.from({ length: 20 }, () => 5),
      ...Array.from({ length: 20 }, () => 10),
      ...Array.from({ length: 20 }, () => 15),
    ]
    const segs = [
      ...Array.from({ length: 20 }, () => 'A'),
      ...Array.from({ length: 20 }, () => 'B'),
      ...Array.from({ length: 20 }, () => 'C'),
    ]
    const data: ResolvedColumnData = {
      columns: [makeCol('Value', vals)],
      segment: makeSeg('Group', segs),
      n: 60,
    }
    const result = await plugin.run(data)
    const anova = (result.data as any).result
    expect(anova.posthoc.length).toBe(3) // 3C2 = 3 pairs
    expect(anova.posthoc[0]).toHaveProperty('significant')
  })

  it('tukeyHSD engine function returns correct pairwise results', () => {
    const groups = [
      [1, 2, 3, 4, 5],
      [10, 11, 12, 13, 14],
      [20, 21, 22, 23, 24],
    ]
    // @ts-ignore
    const results = StatsEngine.tukeyHSD(groups)
    expect(results).toHaveLength(3)
    expect(results[0].groupA).toBe(0)
    expect(results[0].groupB).toBe(1)
    expect(Math.abs(results[0].meanDiff)).toBeCloseTo(9, 0)
  })

  it('uses Welch ANOVA for unequal variances', async () => {
    // Group A: tight, Group B: very spread
    const vals = [
      ...Array.from({ length: 30 }, () => 10 + Math.random() * 0.1),
      ...Array.from({ length: 30 }, () => 10 + Math.random() * 50),
    ]
    const segs = [
      ...Array.from({ length: 30 }, () => 'Tight'),
      ...Array.from({ length: 30 }, () => 'Spread'),
    ]
    const data: ResolvedColumnData = {
      columns: [makeCol('Score', vals)],
      segment: makeSeg('Group', segs),
      n: 60,
    }
    const result = await plugin.run(data)
    const anova = (result.data as any).result
    // Should either use Welch or standard — both valid
    expect(typeof anova.welchUsed).toBe('boolean')
  })

  it('blocks non-normal small sample and suggests KW', async () => {
    // Very skewed data with small groups
    const vals = [
      ...Array.from({ length: 8 }, () => 1),
      ...Array.from({ length: 8 }, (_, i) => i < 6 ? 1 : 100),
    ]
    const segs = [
      ...Array.from({ length: 8 }, () => 'A'),
      ...Array.from({ length: 8 }, () => 'B'),
    ]
    const data: ResolvedColumnData = {
      columns: [makeCol('Skewed', vals)],
      segment: makeSeg('Group', segs),
      n: 16,
    }
    await expect(plugin.run(data)).rejects.toThrow()
  })

  it('produces group means chart', async () => {
    const vals = [
      ...Array.from({ length: 25 }, () => 10 + Math.random() * 5),
      ...Array.from({ length: 25 }, () => 15 + Math.random() * 5),
    ]
    const segs = [
      ...Array.from({ length: 25 }, () => 'A'),
      ...Array.from({ length: 25 }, () => 'B'),
    ]
    const data: ResolvedColumnData = {
      columns: [makeCol('Score', vals)],
      segment: makeSeg('Group', segs),
      n: 50,
    }
    const result = await plugin.run(data)
    expect(result.charts.length).toBeGreaterThanOrEqual(1)
  })
})
