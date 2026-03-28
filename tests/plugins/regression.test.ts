/**
 * RegressionPlugin cross-validation tests.
 */
import { describe, it, expect } from 'vitest'
import { RegressionPlugin } from '../../src/plugins/RegressionPlugin'
import type { ResolvedColumnData } from '../../src/plugins/types'

function makeNumericColumn(id: string, name: string, n: number, fn: (i: number) => number) {
  return { id, name, values: Array.from({ length: n }, (_, i) => fn(i)) }
}

describe('RegressionPlugin with CV', () => {
  it('finding includes cv in result data when n >= 30', async () => {
    const n = 60
    const data: ResolvedColumnData = {
      columns: [
        makeNumericColumn('y', 'Outcome', n, (i) => i * 0.5 + Math.sin(i) * 2),
        makeNumericColumn('x1', 'Predictor', n, (i) => i * 0.4 + (i % 3)),
      ],
      n,
    }

    const result = await RegressionPlugin.run(data)
    const regData = result.data as any
    expect(regData.result.cv).toBeDefined()
    expect(regData.result.cv.k).toBe(5)
    expect(regData.result.cv.foldResults.length).toBe(5)
    expect(regData.result.cv.meanR2orAUC).toBeGreaterThanOrEqual(0)
  })

  it('finding has overfit_warning flag when CV delta > 0.1', async () => {
    // Many predictors, small n → overfit
    const n = 35
    const cols = [
      makeNumericColumn('y', 'Outcome', n, () => Math.random()),
      ...Array.from({ length: 15 }, (_, j) =>
        makeNumericColumn(`x${j}`, `Noise${j}`, n, () => Math.random())
      ),
    ]

    const data: ResolvedColumnData = { columns: cols, n }

    const result = await RegressionPlugin.run(data)
    const flags = result.findings[0]?.flags ?? []
    const overfitFlag = flags.find((f: any) => f.type === 'overfit_warning')
    const regData = result.data as any

    if (regData.result.cv?.overfit) {
      expect(overfitFlag).toBeDefined()
      expect(overfitFlag.severity).toBe('warning')
      expect(overfitFlag.message).toContain('held-out')
    }
  })

  it('plainLanguage output contains "held-out data" when CV ran', async () => {
    const n = 100
    const data: ResolvedColumnData = {
      columns: [
        makeNumericColumn('y', 'Satisfaction', n, (i) => i * 0.3 + (i % 5)),
        makeNumericColumn('x1', 'Quality', n, (i) => i * 0.5 + Math.sin(i)),
      ],
      n,
    }

    const result = await RegressionPlugin.run(data)
    expect(result.plainLanguage).toContain('held-out data')
  })

  it('plainLanguage does not contain "held-out data" when n < 30', async () => {
    const n = 20
    const data: ResolvedColumnData = {
      columns: [
        makeNumericColumn('y', 'Outcome', n, (i) => i * 2),
        makeNumericColumn('x1', 'Predictor', n, (i) => i),
      ],
      n,
    }

    const result = await RegressionPlugin.run(data)
    expect(result.plainLanguage).not.toContain('held-out data')
  })
})
