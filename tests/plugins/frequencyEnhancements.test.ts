/**
 * FrequencyPlugin enhancement tests — SD, mention %, matrix summary table.
 */
import { describe, it, expect } from 'vitest'
import { FrequencyPlugin } from '../../src/plugins/FrequencyPlugin'
import type { ResolvedColumnData } from '../../src/plugins/types'

// ============================================================
// SD tests
// ============================================================

describe('FrequencyPlugin — Standard Deviation', () => {
  it('computes SD for numeric columns', async () => {
    // 10 values: 1,2,3,4,5,1,2,3,4,5 → mean=3.0, sd≈1.49
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5] }],
      n: 10,
    }

    const result = await FrequencyPlugin.run(data)
    const freqs = (result.data as any).frequencies
    expect(freqs).toHaveLength(1)
    expect(freqs[0].sd).not.toBeNull()
    expect(freqs[0].sd).toBeCloseTo(1.49, 1)
    expect(freqs[0].mean).toBeCloseTo(3.0, 1)
    expect(freqs[0].median).toBeCloseTo(3.0, 1)
  })

  it('returns null SD for single-value column', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [3] }],
      n: 1,
    }

    const result = await FrequencyPlugin.run(data)
    const freqs = (result.data as any).frequencies
    expect(freqs[0].sd).toBeNull()
    expect(freqs[0].mean).toBe(3)
  })

  it('includes SD in finding summary text', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Satisfaction', values: [1, 2, 3, 4, 5, 4, 3, 4, 5, 4] }],
      n: 10,
    }

    const result = await FrequencyPlugin.run(data)
    const finding = result.findings[0]
    expect(finding.summary).toContain('SD =')
  })
})

// ============================================================
// Mention % tests
// ============================================================

describe('FrequencyPlugin — Mention %', () => {
  it('includes mention breakdown for not_chosen columns', async () => {
    // 3-option checkbox: 20 respondents total
    // Option A: 12 selected (60% respondent, ~46% mention)
    // Option B: 8 selected  (40% respondent, ~31% mention)
    // Option C: 6 selected  (30% respondent, ~23% mention)
    const valuesA: (string | null)[] = []
    for (let i = 0; i < 12; i++) valuesA.push('A')
    for (let i = 0; i < 8; i++) valuesA.push(null)

    const valuesB: (string | null)[] = []
    for (let i = 0; i < 8; i++) valuesB.push('B')
    for (let i = 0; i < 12; i++) valuesB.push(null)

    const valuesC: (string | null)[] = []
    for (let i = 0; i < 6; i++) valuesC.push('C')
    for (let i = 0; i < 14; i++) valuesC.push(null)

    const data: ResolvedColumnData = {
      columns: [
        { id: 'optA', name: 'Option A', values: valuesA, nullMeaning: 'not_chosen' },
        { id: 'optB', name: 'Option B', values: valuesB, nullMeaning: 'not_chosen' },
        { id: 'optC', name: 'Option C', values: valuesC, nullMeaning: 'not_chosen' },
      ],
      n: 20,
      rowCount: 20,
    }

    const result = await FrequencyPlugin.run(data)

    // Each column is a separate finding
    const findingA = result.findings.find((f) => f.title.includes('Option A'))
    expect(findingA).toBeDefined()
    expect(findingA!.summary).toContain('mentions')
    expect(findingA!.summary).toContain('respondents')
  })

  it('does not include mention breakdown for regular columns', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 4, 5] }],
      n: 5,
    }

    const result = await FrequencyPlugin.run(data)
    expect(result.findings[0].summary).not.toContain('mentions')
  })
})

// ============================================================
// Matrix summary table tests
// ============================================================

describe('FrequencyPlugin — Matrix Summary Table', () => {
  it('produces summary table for 3-statement × 5-point matrix', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Quality', values: [1, 2, 3, 4, 5, 3, 4, 4, 5, 3] },
        { id: 'q2', name: 'Service', values: [2, 3, 4, 5, 1, 4, 3, 5, 2, 4] },
        { id: 'q3', name: 'Price',   values: [3, 3, 2, 4, 5, 2, 3, 4, 3, 4] },
      ],
      n: 10,
    }

    const result = await FrequencyPlugin.run(data)

    // Table must be present
    expect(result.tables).toBeDefined()
    expect(result.tables!.length).toBeGreaterThanOrEqual(1)

    const table = result.tables!.find((t) => t.title.includes('Matrix Summary'))
    expect(table).toBeDefined()

    // 3 rows (one per statement)
    expect(table!.rows).toHaveLength(3)

    // Columns: Item + 5 scale points + Mean = 7
    expect(table!.columns).toHaveLength(7)
    expect(table!.columns[0].key).toBe('item')
    expect(table!.columns[6].key).toBe('mean')

    // Verify mean is a number with 2dp
    const qualityRow = table!.rows.find((r) => r.item === 'Quality')
    expect(qualityRow).toBeDefined()
    expect(typeof qualityRow!.mean).toBe('number')
    // Mean of [1,2,3,4,5,3,4,4,5,3] = 3.4
    expect(qualityRow!.mean).toBeCloseTo(3.4, 1)

    // Verify % cells sum to ~100 per row
    let sumPct = 0
    for (let i = 1; i <= 5; i++) {
      const val = qualityRow![`scale_${i}`]
      if (typeof val === 'string') {
        sumPct += parseFloat(val.replace('%', ''))
      }
    }
    expect(sumPct).toBeCloseTo(100, 0)
  })

  it('does not produce matrix table for single column', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 4, 5] }],
      n: 5,
    }

    const result = await FrequencyPlugin.run(data)
    // No matrix table for single column
    const matrixTable = result.tables?.find((t) => t.title.includes('Matrix Summary'))
    expect(matrixTable).toBeUndefined()
  })

  it('does not produce matrix table when segment is present', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Quality', values: [1, 2, 3, 4, 5] },
        { id: 'q2', name: 'Service', values: [2, 3, 4, 5, 1] },
      ],
      segment: { id: 'seg', name: 'Group', values: ['A', 'A', 'B', 'B', 'A'] },
      n: 5,
    }

    const result = await FrequencyPlugin.run(data)
    // Segment present → segment tables, not matrix summary
    const matrixTable = result.tables?.find((t) => t.title.includes('Matrix Summary'))
    expect(matrixTable).toBeUndefined()
  })

  it('preserves per-column findings alongside matrix table', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Quality', values: [1, 2, 3, 4, 5, 3, 4, 4, 5, 3] },
        { id: 'q2', name: 'Service', values: [2, 3, 4, 5, 1, 4, 3, 5, 2, 4] },
      ],
      n: 10,
    }

    const result = await FrequencyPlugin.run(data)

    // Per-column findings still exist
    expect(result.findings).toHaveLength(2)
    expect(result.findings[0].title).toContain('Quality')
    expect(result.findings[1].title).toContain('Service')

    // Matrix table also exists
    expect(result.tables).toBeDefined()
    expect(result.tables!.some((t) => t.title.includes('Matrix Summary'))).toBe(true)
  })
})
