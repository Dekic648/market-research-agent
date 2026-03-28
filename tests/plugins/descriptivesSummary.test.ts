import { describe, it, expect } from 'vitest'
import '../../src/plugins/DescriptivesSummaryPlugin'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../../src/plugins/types'

function makeCol(name: string, values: number[]) {
  return {
    id: `col_${name}`, name, values: values as (number | string | null)[],
    nullMeaning: 'missing' as const, declaredScaleRange: [1, 5] as [number, number],
  }
}

describe('DescriptivesSummaryPlugin', () => {
  const plugin = AnalysisRegistry.get('descriptives_summary')!

  it('produces summary table with 2 rows for 2 ordinal columns', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeCol('Quality', Array.from({ length: 50 }, (_, i) => (i % 5) + 1)),
        makeCol('Speed', Array.from({ length: 50 }, (_, i) => (i % 4) + 2)),
      ],
      n: 50,
    }
    const result = await plugin.run(data)
    const rows = (result.data as any).result.rows
    expect(rows).toHaveLength(2)
    expect(rows[0].columnName).toBe('Quality')
    expect(rows[1].columnName).toBe('Speed')
  })

  it('rejects single column', async () => {
    const data: ResolvedColumnData = {
      columns: [makeCol('Only', Array.from({ length: 50 }, (_, i) => (i % 5) + 1))],
      n: 50,
    }
    await expect(plugin.run(data)).rejects.toThrow()
  })

  it('computes Top Box correctly per row', async () => {
    // Column A: mostly 5s → high topBox. Column B: mostly 1s → low topBox
    const data: ResolvedColumnData = {
      columns: [
        makeCol('HighScorer', Array.from({ length: 100 }, () => 5)),
        makeCol('LowScorer', Array.from({ length: 100 }, () => 1)),
      ],
      n: 100,
    }
    const result = await plugin.run(data)
    const rows = (result.data as any).result.rows
    expect(rows[0].topBox).toBe(100)
    expect(rows[1].topBox).toBe(0)
  })

  it('produces a Top Box ranking chart', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeCol('A', Array.from({ length: 50 }, (_, i) => (i % 5) + 1)),
        makeCol('B', Array.from({ length: 50 }, (_, i) => (i % 3) + 3)),
      ],
      n: 50,
    }
    const result = await plugin.run(data)
    expect(result.charts.length).toBeGreaterThanOrEqual(1)
    expect(result.charts[0].type).toBe('horizontalBar')
  })

  it('plain language names highest and lowest correctly', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeCol('Best', Array.from({ length: 100 }, () => 5)),
        makeCol('Worst', Array.from({ length: 100 }, () => 1)),
      ],
      n: 100,
    }
    const result = await plugin.run(data)
    expect(result.plainLanguage).toContain('Best')
    expect(result.plainLanguage).toContain('scores highest')
  })

  it('notes significant spread when gap > 20%', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeCol('High', Array.from({ length: 100 }, () => 5)),
        makeCol('Low', Array.from({ length: 100 }, () => 2)),
      ],
      n: 100,
    }
    const result = await plugin.run(data)
    expect(result.findings[0].summary).toContain('spread')
  })
})
