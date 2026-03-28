/**
 * FrequencyPlugin denominator tests — nullMeaning-aware percentage computation.
 */
import { describe, it, expect } from 'vitest'
import { FrequencyPlugin } from '../../src/plugins/FrequencyPlugin'
import type { ResolvedColumnData } from '../../src/plugins/types'

describe('FrequencyPlugin denominator by nullMeaning', () => {
  it('not_chosen column: percentages computed out of rowCount (200), not non-null (80)', async () => {
    // 200 rows, 80 selected "Yes" (non-null), 120 null (not selected)
    const values: (number | string | null)[] = []
    for (let i = 0; i < 80; i++) values.push('Yes')
    for (let i = 0; i < 120; i++) values.push(null)

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Opted In', values, nullMeaning: 'not_chosen' }],
      n: 200,
      rowCount: 200,
    }

    const result = await FrequencyPlugin.run(data)
    const freqs = (result.data as any).frequencies
    expect(freqs).toHaveLength(1)

    const yesItem = freqs[0].items.find((it: any) => it.value === 'Yes')
    expect(yesItem).toBeDefined()
    // 80 out of 200 = 40%, not 80 out of 80 = 100%
    expect(yesItem.pct).toBeCloseTo(40, 0)
    expect(freqs[0].n).toBe(200) // denominator is rowCount
  })

  it('not_asked column: percentages computed out of non-null count (60)', async () => {
    // 200 rows, 60 answered, 140 not shown
    const values: (number | string | null)[] = []
    for (let i = 0; i < 30; i++) values.push(4)
    for (let i = 0; i < 30; i++) values.push(5)
    for (let i = 0; i < 140; i++) values.push(null)

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Follow-up Rating', values, nullMeaning: 'not_asked' }],
      n: 200,
      rowCount: 200,
    }

    const result = await FrequencyPlugin.run(data)
    const freqs = (result.data as any).frequencies
    expect(freqs).toHaveLength(1)
    expect(freqs[0].n).toBe(60) // denominator is non-null count

    const item4 = freqs[0].items.find((it: any) => it.value === 4)
    expect(item4).toBeDefined()
    // 30 out of 60 = 50%
    expect(item4.pct).toBeCloseTo(50, 0)
  })

  it('missing column: percentages computed out of non-null count (current behavior)', async () => {
    const values: (number | string | null)[] = []
    for (let i = 0; i < 80; i++) values.push(3)
    for (let i = 0; i < 20; i++) values.push(null)

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Satisfaction', values, nullMeaning: 'missing' }],
      n: 100,
      rowCount: 100,
    }

    const result = await FrequencyPlugin.run(data)
    const freqs = (result.data as any).frequencies
    expect(freqs[0].n).toBe(80) // non-null count
  })

  it('plainLanguage for not_asked column contains base reference', async () => {
    const values: (number | string | null)[] = []
    for (let i = 0; i < 30; i++) values.push('Good')
    for (let i = 0; i < 30; i++) values.push('Bad')
    for (let i = 0; i < 140; i++) values.push(null)

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Follow-up', values, nullMeaning: 'not_asked' }],
      n: 200,
      rowCount: 200,
    }

    const result = await FrequencyPlugin.run(data)
    const text = result.plainLanguage
    expect(text).toContain('n=60')
  })
})
