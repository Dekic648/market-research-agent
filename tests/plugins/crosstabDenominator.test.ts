/**
 * CrosstabPlugin denominator tests — nullMeaning-aware grandTotal.
 */
import { describe, it, expect } from 'vitest'
import { CrosstabPlugin } from '../../src/plugins/CrosstabPlugin'
import type { ResolvedColumnData } from '../../src/plugins/types'

describe('CrosstabPlugin denominator by nullMeaning', () => {
  it('not_chosen question: grandTotal includes rows where question is null but segment is present', async () => {
    // 100 rows, 40 selected "Yes", 60 null (not selected), all have segment
    const qValues: (string | null)[] = []
    const segValues: string[] = []
    for (let i = 0; i < 20; i++) { qValues.push('Yes'); segValues.push('GroupA') }
    for (let i = 0; i < 20; i++) { qValues.push('Yes'); segValues.push('GroupB') }
    for (let i = 0; i < 30; i++) { qValues.push(null); segValues.push('GroupA') }
    for (let i = 0; i < 30; i++) { qValues.push(null); segValues.push('GroupB') }

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Opted In', values: qValues, nullMeaning: 'not_chosen' }],
      segment: { id: 'seg', name: 'Group', values: segValues },
      n: 100,
      rowCount: 100,
    }

    const result = await CrosstabPlugin.run(data)
    const crosstabs = (result.data as any).crosstabs
    expect(crosstabs).toHaveLength(1)

    // grandTotal should be 100 (all rows with segment), not 40 (non-null question only)
    expect(crosstabs[0].grandTotal).toBe(100)
  })

  it('not_asked question: grandTotal only counts rows where both are non-null', async () => {
    const qValues: (number | null)[] = []
    const segValues: string[] = []
    for (let i = 0; i < 30; i++) { qValues.push(4); segValues.push('GroupA') }
    for (let i = 0; i < 30; i++) { qValues.push(5); segValues.push('GroupB') }
    for (let i = 0; i < 40; i++) { qValues.push(null); segValues.push('GroupA') }

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Follow-up', values: qValues, nullMeaning: 'not_asked' }],
      segment: { id: 'seg', name: 'Group', values: segValues },
      n: 100,
      rowCount: 100,
    }

    const result = await CrosstabPlugin.run(data)
    const crosstabs = (result.data as any).crosstabs
    expect(crosstabs[0].grandTotal).toBe(60) // only non-null rows
  })

  it('missing question: grandTotal only counts non-null pairs (current behavior)', async () => {
    const qValues: (number | null)[] = [1, 2, null, 4, null]
    const segValues: string[] = ['A', 'B', 'A', 'B', 'A']

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: qValues, nullMeaning: 'missing' }],
      segment: { id: 'seg', name: 'Group', values: segValues },
      n: 5,
      rowCount: 5,
    }

    const result = await CrosstabPlugin.run(data)
    const crosstabs = (result.data as any).crosstabs
    expect(crosstabs[0].grandTotal).toBe(3) // only rows where both non-null
  })
})
