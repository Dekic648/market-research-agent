import { describe, it, expect } from 'vitest'
import '../../src/plugins/LogisticRegressionPlugin'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import type { ResolvedColumnData } from '../../src/plugins/types'

function makeCol(name: string, values: number[]) {
  return { id: `col_${name}`, name, values: values as (number | string | null)[], nullMeaning: 'missing' as const }
}

describe('LogisticRegressionPlugin', () => {
  const plugin = AnalysisRegistry.get('logistic_regression')!

  it('runs with binary outcome + 2 continuous predictors', async () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => i < 50 ? 0 : 1)
    const x1 = Array.from({ length: n }, (_, i) => i * 0.1 + Math.random())
    const x2 = Array.from({ length: n }, (_, i) => 5 - i * 0.05 + Math.random())
    const data: ResolvedColumnData = {
      columns: [makeCol('converted', y), makeCol('engagement', x1), makeCol('tenure', x2)],
      n,
    }
    const result = await plugin.run(data)
    const lr = (result.data as any).result
    expect(lr.auc).toBeGreaterThanOrEqual(0)
    expect(lr.auc).toBeLessThanOrEqual(1)
    expect(lr.pctCorrect).toBeGreaterThan(0)
    expect(lr.coefficients.length).toBe(3) // intercept + 2 predictors
  })

  it('computes OR as exp(coefficient)', async () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => i < 50 ? 0 : 1)
    const x1 = Array.from({ length: n }, (_, i) => i * 0.1)
    const data: ResolvedColumnData = {
      columns: [makeCol('outcome', y), makeCol('predictor', x1)],
      n,
    }
    const result = await plugin.run(data)
    const lr = (result.data as any).result
    const pred = lr.coefficients.find((c: any) => c.name === 'predictor')
    expect(pred.OR).toBeCloseTo(Math.exp(pred.B), 3)
  })

  it('warns on class imbalance < 10%', async () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => i < 5 ? 1 : 0) // only 5% positive
    const x1 = Array.from({ length: n }, (_, i) => i * 0.1)
    const data: ResolvedColumnData = {
      columns: [makeCol('rare_event', y), makeCol('predictor', x1)],
      n,
    }
    const result = await plugin.run(data)
    const flags = result.findings[0]?.flags ?? []
    const imbalanceFlag = flags.find((f: any) => f.type === 'class_imbalance')
    expect(imbalanceFlag).toBeDefined()
  })

  it('rejects non-binary outcome', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeCol('ordinal', Array.from({ length: 100 }, (_, i) => i % 3)),
        makeCol('predictor', Array.from({ length: 100 }, (_, i) => i)),
      ],
      n: 100,
    }
    await expect(plugin.run(data)).rejects.toThrow()
  })

  it('rejects n < 50', async () => {
    const n = 30
    const data: ResolvedColumnData = {
      columns: [
        makeCol('outcome', Array.from({ length: n }, (_, i) => i < 15 ? 0 : 1)),
        makeCol('predictor', Array.from({ length: n }, (_, i) => i)),
      ],
      n,
    }
    await expect(plugin.run(data)).rejects.toThrow()
  })

  it('reports AUC within valid range', async () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => i < 50 ? 0 : 1)
    const x1 = Array.from({ length: n }, (_, i) => i + Math.random() * 10)
    const data: ResolvedColumnData = {
      columns: [makeCol('outcome', y), makeCol('pred', x1)],
      n,
    }
    const result = await plugin.run(data)
    const lr = (result.data as any).result
    expect(lr.auc).toBeGreaterThanOrEqual(0)
    expect(lr.auc).toBeLessThanOrEqual(1)
  })

  it('computes CV-AUC and attaches to result', async () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => i < 50 ? 0 : 1)
    const x1 = Array.from({ length: n }, (_, i) => i * 0.1)
    const data: ResolvedColumnData = {
      columns: [makeCol('outcome', y), makeCol('pred', x1)],
      n,
    }
    const result = await plugin.run(data)
    const lr = (result.data as any).result
    expect(lr.cvAUC).toBeDefined()
    expect(typeof lr.cvAUC).toBe('number')
  })

  it('produces odds ratio chart', async () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => i < 50 ? 0 : 1)
    const x1 = Array.from({ length: n }, (_, i) => i * 0.1)
    const data: ResolvedColumnData = {
      columns: [makeCol('outcome', y), makeCol('pred', x1)],
      n,
    }
    const result = await plugin.run(data)
    expect(result.charts.length).toBeGreaterThanOrEqual(1)
  })
})
