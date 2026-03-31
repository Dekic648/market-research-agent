/**
 * CrosstabPlugin chi-square integration tests.
 */
import { describe, it, expect } from 'vitest'
import { CrosstabPlugin } from '../../src/plugins/CrosstabPlugin'
import type { ResolvedColumnData } from '../../src/plugins/types'

describe('CrosstabPlugin — chi-square', () => {
  it('computes chi-square for categorical × segment', async () => {
    // Clear association: Group A mostly picks "Red", Group B mostly picks "Blue"
    const values: string[] = []
    const segs: string[] = []
    for (let i = 0; i < 40; i++) { values.push('Red'); segs.push('A') }
    for (let i = 0; i < 10; i++) { values.push('Blue'); segs.push('A') }
    for (let i = 0; i < 10; i++) { values.push('Red'); segs.push('B') }
    for (let i = 0; i < 40; i++) { values.push('Blue'); segs.push('B') }

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Color', values }],
      segment: { id: 'seg', name: 'Group', values: segs },
      n: 100,
    }

    const result = await CrosstabPlugin.run(data)
    const finding = result.findings[0]

    // Chi-square should be significant
    expect(finding.significant).toBe(true)
    expect(finding.pValue).not.toBeNull()
    expect(finding.pValue).toBeLessThan(0.05)
    expect(finding.effectSize).not.toBeNull()
    expect(finding.effectSize).toBeGreaterThan(0)

    // summaryLanguage should mention chi-square
    expect(finding.summaryLanguage).toContain('significant association')
    expect(finding.summaryLanguage).toContain('χ²')

    // Detail should contain chi-square results
    const detail = JSON.parse(finding.detail as string)
    expect(detail.chiSquare).toBeDefined()
    expect(detail.chiSquare.cramersV).toBeGreaterThan(0)
  })

  it('produces non-significant result for uniform distribution', async () => {
    // No association: both groups pick equally
    const values: string[] = []
    const segs: string[] = []
    for (let i = 0; i < 25; i++) { values.push('Red'); segs.push('A') }
    for (let i = 0; i < 25; i++) { values.push('Blue'); segs.push('A') }
    for (let i = 0; i < 25; i++) { values.push('Red'); segs.push('B') }
    for (let i = 0; i < 25; i++) { values.push('Blue'); segs.push('B') }

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Color', values }],
      segment: { id: 'seg', name: 'Group', values: segs },
      n: 100,
    }

    const result = await CrosstabPlugin.run(data)
    const finding = result.findings[0]

    // Should not be significant
    expect(finding.significant).toBe(false)
    // summaryLanguage should not mention chi-square significance
    expect(finding.summaryLanguage).not.toContain('significant association')
  })

  it('ordinal × segment still gets chi-square alongside index', async () => {
    // Ordinal data also gets chi-square (valid for any contingency table)
    const values = [1, 2, 3, 4, 5, 1, 1, 1, 2, 2, 5, 5, 5, 5, 4, 4, 3, 3, 2, 1]
    const segs = ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B']

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values }],
      segment: { id: 'seg', name: 'Group', values: segs },
      n: 20,
    }

    const result = await CrosstabPlugin.run(data)
    const finding = result.findings[0]

    // Should have chi-square result in detail
    const detail = JSON.parse(finding.detail as string)
    expect(detail.chiSquare).toBeDefined()
    expect(typeof detail.chiSquare.chiSquare).toBe('number')
  })
})
