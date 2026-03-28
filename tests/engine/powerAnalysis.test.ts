/**
 * Power analysis function tests.
 */
import { describe, it, expect } from 'vitest'
import { powerTTest, powerANOVA, powerCorrelation, powerChiSq } from '../../src/engine/stats-engine'

describe('powerTTest', () => {
  it('requiredN close to 64 for medium effect, 80% power', () => {
    // @ts-ignore
    const r = powerTTest({ effectSize: 0.5, alpha: 0.05, power: 0.80 })
    expect(r.requiredN).toBeGreaterThanOrEqual(60)
    expect(r.requiredN).toBeLessThanOrEqual(70)
  })

  it('achievedPower close to 0.80 for n=64, d=0.5', () => {
    // @ts-ignore
    const r = powerTTest({ effectSize: 0.5, alpha: 0.05, n: 64 })
    expect(r.achievedPower).toBeGreaterThan(0.70)
    expect(r.achievedPower).toBeLessThan(0.90)
  })

  it('achievedPower between 0 and 1', () => {
    // @ts-ignore
    const r = powerTTest({ effectSize: 0.3, alpha: 0.05, n: 50 })
    expect(r.achievedPower).toBeGreaterThanOrEqual(0)
    expect(r.achievedPower).toBeLessThanOrEqual(1)
  })

  it('handles effectSize = 0', () => {
    // @ts-ignore
    const r = powerTTest({ effectSize: 0 })
    expect(r.requiredN).toBe(Infinity)
  })

  it('handles n = 1', () => {
    // @ts-ignore
    const r = powerTTest({ effectSize: 0.5, n: 1 })
    expect(r.achievedPower).toBeGreaterThanOrEqual(0)
    expect(r.achievedPower).toBeLessThanOrEqual(1)
  })
})

describe('powerCorrelation', () => {
  it('requiredN close to 84 for r=0.3, 80% power', () => {
    // @ts-ignore
    const r = powerCorrelation({ r: 0.3, alpha: 0.05, power: 0.80 })
    expect(r.requiredN).toBeGreaterThanOrEqual(78)
    expect(r.requiredN).toBeLessThanOrEqual(92)
  })
})

describe('powerANOVA', () => {
  it('requiredN in reasonable range for f=0.25, 3 groups, 80% power', () => {
    // @ts-ignore
    const r = powerANOVA({ effectSize: 0.25, nGroups: 3, alpha: 0.05, power: 0.80 })
    expect(r.requiredN).toBeGreaterThanOrEqual(40)
    expect(r.requiredN).toBeLessThanOrEqual(80)
  })
})

describe('powerChiSq', () => {
  it('requiredN in reasonable range for w=0.3, df=2, 80% power', () => {
    // @ts-ignore
    const r = powerChiSq({ effectSize: 0.3, df: 2, alpha: 0.05, power: 0.80 })
    expect(r.requiredN).toBeGreaterThanOrEqual(50)
    expect(r.requiredN).toBeLessThanOrEqual(120)
  })

  it('achievedPower between 0 and 1', () => {
    // @ts-ignore
    const r = powerChiSq({ effectSize: 0.3, df: 2, n: 100 })
    expect(r.achievedPower).toBeGreaterThanOrEqual(0)
    expect(r.achievedPower).toBeLessThanOrEqual(1)
  })
})
