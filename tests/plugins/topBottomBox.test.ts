import { describe, it, expect } from 'vitest'
import '../../src/plugins/FrequencyPlugin'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../../src/plugins/types'

function makeCol(name: string, values: (number | string | null)[], declaredScaleRange?: [number, number]) {
  return {
    id: `col_${name}`, name, values, nullMeaning: 'missing' as const,
    declaredScaleRange: declaredScaleRange ?? null,
  }
}

describe('FrequencyPlugin — Top/Bottom Box', () => {
  const plugin = AnalysisRegistry.get('frequency')!

  it('computes topBox > 60 when responses clustered high on 5-pt scale', async () => {
    // 100 responses: mostly 4s and 5s
    const vals = Array.from({ length: 100 }, (_, i) => i < 70 ? 5 : i < 85 ? 4 : i < 95 ? 3 : i < 98 ? 2 : 1)
    const data: ResolvedColumnData = {
      columns: [makeCol('Satisfaction', vals, [1, 5])],
      n: 100,
    }
    const result = await plugin.run(data)
    const freq = (result.data as any).frequencies[0]
    expect(freq.topBox).toBeGreaterThan(60)
    expect(freq.topBoxLabel).toBe('Top 2 Box')
  })

  it('computes bottomBox > 60 when responses clustered low', async () => {
    const vals = Array.from({ length: 100 }, (_, i) => i < 40 ? 1 : i < 75 ? 2 : i < 90 ? 3 : i < 95 ? 4 : 5)
    const data: ResolvedColumnData = {
      columns: [makeCol('Satisfaction', vals, [1, 5])],
      n: 100,
    }
    const result = await plugin.run(data)
    const freq = (result.data as any).frequencies[0]
    expect(freq.bottomBox).toBeGreaterThan(60)
  })

  it('uses single top/bottom for 3-point scale', async () => {
    const vals = Array.from({ length: 60 }, (_, i) => i < 30 ? 3 : i < 50 ? 2 : 1)
    const data: ResolvedColumnData = {
      columns: [makeCol('Agreement', vals, [1, 3])],
      n: 60,
    }
    const result = await plugin.run(data)
    const freq = (result.data as any).frequencies[0]
    expect(freq.topBoxLabel).toBe('Top Box')
    expect(freq.bottomBoxLabel).toBe('Bottom Box')
  })

  it('infers scale from actual values when no declaredScaleRange', async () => {
    const vals = Array.from({ length: 100 }, (_, i) => i < 60 ? 5 : i < 80 ? 4 : i < 90 ? 3 : i < 95 ? 2 : 1)
    const data: ResolvedColumnData = {
      columns: [makeCol('Quality', vals)],
      n: 100,
    }
    const result = await plugin.run(data)
    const freq = (result.data as any).frequencies[0]
    expect(freq.topBox).toBeGreaterThan(50)
  })

  it('computes netScore correctly as topBox - bottomBox', async () => {
    const vals = Array.from({ length: 100 }, (_, i) => i < 40 ? 5 : i < 60 ? 4 : i < 80 ? 3 : i < 90 ? 2 : 1)
    const data: ResolvedColumnData = {
      columns: [makeCol('Rating', vals, [1, 5])],
      n: 100,
    }
    const result = await plugin.run(data)
    const freq = (result.data as any).frequencies[0]
    expect(freq.netScore).toBeCloseTo(freq.topBox - freq.bottomBox, 1)
  })

  it('plain language leads with Top Box percentage', async () => {
    const vals = Array.from({ length: 100 }, (_, i) => i < 60 ? 5 : i < 80 ? 4 : i < 90 ? 3 : 1)
    const data: ResolvedColumnData = {
      columns: [makeCol('Rating', vals, [1, 5])],
      n: 100,
    }
    const result = await plugin.run(data)
    expect(result.findings[0].summary).toContain('% rate')
    expect(result.findings[0].summary).toContain('positively')
  })
})
