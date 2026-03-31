/**
 * FrequencyPlugin segment table tests — % breakdown by segment.
 */
import { describe, it, expect } from 'vitest'
import { FrequencyPlugin } from '../../src/plugins/FrequencyPlugin'
import type { ResolvedColumnData } from '../../src/plugins/types'

describe('FrequencyPlugin segment table', () => {
  it('produces a % table when segment is present for a single-item rating', async () => {
    // 3 segments, 5 response options (1–5), 60 respondents
    const values: (number | null)[] = []
    const segValues: (string | null)[] = []

    // Segment A (20 respondents): heavy on 4–5
    for (let i = 0; i < 2; i++) { values.push(1); segValues.push('A') }
    for (let i = 0; i < 2; i++) { values.push(2); segValues.push('A') }
    for (let i = 0; i < 4; i++) { values.push(3); segValues.push('A') }
    for (let i = 0; i < 6; i++) { values.push(4); segValues.push('A') }
    for (let i = 0; i < 6; i++) { values.push(5); segValues.push('A') }

    // Segment B (20 respondents): heavy on 1–2
    for (let i = 0; i < 7; i++) { values.push(1); segValues.push('B') }
    for (let i = 0; i < 6; i++) { values.push(2); segValues.push('B') }
    for (let i = 0; i < 4; i++) { values.push(3); segValues.push('B') }
    for (let i = 0; i < 2; i++) { values.push(4); segValues.push('B') }
    for (let i = 0; i < 1; i++) { values.push(5); segValues.push('B') }

    // Segment C (20 respondents): uniform
    for (let i = 0; i < 4; i++) { values.push(1); segValues.push('C') }
    for (let i = 0; i < 4; i++) { values.push(2); segValues.push('C') }
    for (let i = 0; i < 4; i++) { values.push(3); segValues.push('C') }
    for (let i = 0; i < 4; i++) { values.push(4); segValues.push('C') }
    for (let i = 0; i < 4; i++) { values.push(5); segValues.push('C') }

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Satisfaction', values }],
      segment: { id: 'seg', name: 'Segment', values: segValues },
      n: 60,
    }

    const result = await FrequencyPlugin.run(data)

    // Table must be present
    expect(result.tables).toBeDefined()
    expect(result.tables!.length).toBe(1)

    const table = result.tables![0]

    // Correct title
    expect(table.title).toBe('Satisfaction — % by segment')

    // 5 response options = 5 rows
    expect(table.rows.length).toBe(5)

    // Columns: Response + 3 segments + Total = 5
    expect(table.columns.length).toBe(5)
    expect(table.columns[0].key).toBe('response')
    expect(table.columns[table.columns.length - 1].key).toBe('total')

    // Column headers contain segment name and n
    const segACol = table.columns.find((c) => c.label.startsWith('A'))
    expect(segACol).toBeDefined()
    expect(segACol!.label).toContain('n=20')

    // Total column header contains grand total n
    const totalCol = table.columns.find((c) => c.key === 'total')
    expect(totalCol!.label).toContain('n=60')

    // % values should sum to ~100 per segment column
    const segAKey = segACol!.key
    let sumA = 0
    for (const row of table.rows) {
      const val = row[segAKey]
      if (typeof val === 'string') {
        sumA += parseFloat(val.replace('%', ''))
      }
    }
    expect(sumA).toBeCloseTo(100, 0)

    // Total column % should sum to ~100
    let sumTotal = 0
    for (const row of table.rows) {
      const val = row.total
      if (typeof val === 'string') {
        sumTotal += parseFloat(val.replace('%', ''))
      }
    }
    expect(sumTotal).toBeCloseTo(100, 0)

    // Spot check: Segment A, response 5 = 6/20 = 30%
    const row5 = table.rows.find((r) => r.response === '5')
    expect(row5).toBeDefined()
    expect(row5![segAKey]).toBe('30.0%')
  })

  it('produces a grouped bar chart alongside the table', async () => {
    const values: (number | null)[] = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
    const segValues: (string | null)[] = ['X', 'X', 'X', 'X', 'X', 'Y', 'Y', 'Y', 'Y', 'Y']

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values }],
      segment: { id: 'seg', name: 'Group', values: segValues },
      n: 10,
    }

    const result = await FrequencyPlugin.run(data)

    // Horizontal bar comes first, then grouped bar for segment
    expect(result.charts.length).toBeGreaterThanOrEqual(2)
    expect(result.charts[0].type).toBe('horizontalBar')
    const groupedBar = result.charts.find((c) => c.type === 'groupedBar')
    expect(groupedBar).toBeDefined()
    expect(result.tables).toBeDefined()
    expect(result.tables!.length).toBe(1)
  })

  it('does not produce a table when no segment is present', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 4, 5] }],
      n: 5,
    }

    const result = await FrequencyPlugin.run(data)
    expect(result.tables).toBeUndefined()
  })
})
