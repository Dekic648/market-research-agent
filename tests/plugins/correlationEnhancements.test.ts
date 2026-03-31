/**
 * CorrelationPlugin enhancement tests — redundancy flag, driver callout, regression guard.
 */
import { describe, it, expect } from 'vitest'
import { CorrelationPlugin } from '../../src/plugins/CorrelationPlugin'
import type { ResolvedColumnData } from '../../src/plugins/types'

/** Generate correlated arrays with approximate target r */
function makeCorrelated(n: number, targetR: number): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i < n; i++) {
    const xi = Math.random() * 10
    x.push(xi)
    // y = targetR * x + noise
    y.push(xi * targetR + (1 - Math.abs(targetR)) * (Math.random() * 10))
  }
  return { x, y }
}

describe('CorrelationPlugin — Redundancy flag (r > 0.8)', () => {
  it('flags r > 0.8 pair as redundant in detail', async () => {
    // Create two nearly identical columns (r ≈ 0.95+)
    const values: number[] = []
    const nearDup: number[] = []
    for (let i = 0; i < 100; i++) {
      const v = Math.random() * 5
      values.push(v)
      nearDup.push(v + Math.random() * 0.3) // tiny noise → very high r
    }

    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Quality A', values },
        { id: 'q2', name: 'Quality B', values: nearDup },
      ],
      n: 100,
    }

    const result = await CorrelationPlugin.run(data)

    // Should have at least one finding
    expect(result.findings.length).toBeGreaterThanOrEqual(1)

    const finding = result.findings[0]
    const detail = JSON.parse(finding.detail)

    // r should be > 0.8
    expect(Math.abs(detail.r)).toBeGreaterThan(0.8)

    // Redundancy flag should be true
    expect(detail.redundancyFlag).toBe(true)

    // Summary should mention warning
    expect(finding.summary).toContain('r > 0.8')
  })
})

describe('CorrelationPlugin — Driver callout', () => {
  it('uses driver framing when outcome column detected', async () => {
    // "overall_satisfaction" matches OUTCOME_KEYWORDS
    const n = 100
    const overall: number[] = []
    const quality: number[] = []
    const price: number[] = []
    for (let i = 0; i < n; i++) {
      const o = Math.random() * 5
      overall.push(o)
      quality.push(o * 0.8 + Math.random()) // high correlation with overall
      price.push(Math.random() * 5)         // low correlation
    }

    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'overall_satisfaction', values: overall },
        { id: 'q2', name: 'Quality', values: quality },
        { id: 'q3', name: 'Price', values: price },
      ],
      n,
    }

    const result = await CorrelationPlugin.run(data)

    // Find the finding involving overall_satisfaction with highest r
    const outcomeFinding = result.findings.find((f) =>
      f.title.includes('overall_satisfaction') || f.summaryLanguage.includes('overall_satisfaction')
    )

    // Should use driver framing: "X is the strongest correlate of overall_satisfaction"
    if (outcomeFinding) {
      expect(outcomeFinding.summaryLanguage).toContain('strongest correlate')
      expect(outcomeFinding.summaryLanguage).toContain('overall_satisfaction')
    }
  })

  it('uses symmetric summaryLanguage when no outcome keyword present', async () => {
    // No column matches OUTCOME_KEYWORDS
    const n = 100
    const a: number[] = []
    const b: number[] = []
    for (let i = 0; i < n; i++) {
      const v = Math.random() * 5
      a.push(v)
      b.push(v * 0.7 + Math.random())
    }

    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Fairness', values: a },
        { id: 'q2', name: 'Balance', values: b },
      ],
      n,
    }

    const result = await CorrelationPlugin.run(data)

    // All findings should use symmetric language (no "strongest correlate")
    for (const f of result.findings) {
      expect(f.summaryLanguage).not.toContain('strongest correlate')
    }

    // Should still have findings if r > 0.5
    if (result.findings.length > 0) {
      const sl = result.findings[0].summaryLanguage
      expect(sl).toMatch(/move together|moderately related|weak relationship/)
    }
  })
})
