/**
 * Rake weight computation tests.
 */
import { describe, it, expect } from 'vitest'
import { computeRakeWeights } from '../../src/engine/rakeWeights'

describe('computeRakeWeights', () => {
  it('returns correct weights for 65%/35% sample vs 40%/60% population', () => {
    // 100 rows: 65 Paid, 35 Organic
    const values: string[] = []
    for (let i = 0; i < 65; i++) values.push('Paid')
    for (let i = 0; i < 35; i++) values.push('Organic')

    const result = computeRakeWeights(values, { Paid: 0.40, Organic: 0.60 })

    // Paid: popProp/sampleProp = 0.40/0.65 ≈ 0.615
    // Organic: 0.60/0.35 ≈ 1.714
    // Before normalization: Paid weight < 1, Organic weight > 1
    expect(result.error).toBeUndefined()
    expect(result.weights.length).toBe(100)

    // Paid weights should be < 1 (overrepresented)
    const paidWeight = result.weights[0]
    expect(paidWeight).toBeLessThan(1)

    // Organic weights should be > 1 (underrepresented)
    const organicWeight = result.weights[65]
    expect(organicWeight).toBeGreaterThan(1)
  })

  it('weights normalize so their mean equals 1.0', () => {
    const values: string[] = []
    for (let i = 0; i < 65; i++) values.push('Paid')
    for (let i = 0; i < 35; i++) values.push('Organic')

    const result = computeRakeWeights(values, { Paid: 0.40, Organic: 0.60 })
    const mean = result.weights.reduce((s, w) => s + w, 0) / result.weights.length
    expect(mean).toBeCloseTo(1.0, 5)
  })

  it('overrepresented group gets weight < 1', () => {
    const values: string[] = []
    for (let i = 0; i < 80; i++) values.push('A') // 80% sample
    for (let i = 0; i < 20; i++) values.push('B')

    const result = computeRakeWeights(values, { A: 0.50, B: 0.50 })
    // A is overrepresented → weight < 1
    expect(result.weights[0]).toBeLessThan(1)
  })

  it('underrepresented group gets weight > 1', () => {
    const values: string[] = []
    for (let i = 0; i < 80; i++) values.push('A')
    for (let i = 0; i < 20; i++) values.push('B') // 20% sample, 50% population

    const result = computeRakeWeights(values, { A: 0.50, B: 0.50 })
    // B is underrepresented → weight > 1
    expect(result.weights[80]).toBeGreaterThan(1)
  })

  it('returns error for group with 0% sample representation', () => {
    const values = ['A', 'A', 'A', 'A', 'A']
    const result = computeRakeWeights(values, { A: 0.50, B: 0.50 })
    expect(result.error).toBeDefined()
    expect(result.error).toContain('no sample representation')
  })

  it('handles all-null values gracefully', () => {
    const values: (string | null)[] = [null, null, null]
    const result = computeRakeWeights(values, { A: 0.50, B: 0.50 })
    expect(result.error).toBeDefined()
  })
})
