/**
 * ColumnFingerprint tests — covers computeFingerprint, diffFingerprints, matchColumns
 */
import { describe, it, expect } from 'vitest'
import { computeFingerprint, diffFingerprints, matchColumns } from '../../src/parsers/fingerprint'
import { PasteGridAdapter } from '../../src/parsers/adapters/PasteGridAdapter'

// ============================================================
// computeFingerprint
// ============================================================

describe('computeFingerprint', () => {
  it('computes basic stats for numeric column', () => {
    const fp = computeFingerprint([1, 2, 3, 4, 5], 'col_0')
    expect(fp.columnId).toBe('col_0')
    expect(fp.nRows).toBe(5)
    expect(fp.nMissing).toBe(0)
    expect(fp.nUnique).toBe(5)
    expect(fp.numericRatio).toBe(1)
    expect(fp.min).toBe(1)
    expect(fp.max).toBe(5)
    expect(fp.mean).toBeCloseTo(3, 5)
    expect(fp.sd).toBeCloseTo(1.5811, 3)
    expect(fp.hash).toBeTruthy()
    expect(fp.computedAt).toBeGreaterThan(0)
  })

  it('handles null values correctly', () => {
    const fp = computeFingerprint([1, null, 3, null, 5], 'col_1')
    expect(fp.nRows).toBe(5)
    expect(fp.nMissing).toBe(2)
    expect(fp.nUnique).toBe(3)
    expect(fp.numericRatio).toBe(1) // 3/3 non-null are numeric
    expect(fp.min).toBe(1)
    expect(fp.max).toBe(5)
    expect(fp.mean).toBeCloseTo(3, 5)
  })

  it('handles string values', () => {
    const fp = computeFingerprint(['yes', 'no', 'yes', 'maybe', null], 'col_2')
    expect(fp.nRows).toBe(5)
    expect(fp.nMissing).toBe(1)
    expect(fp.nUnique).toBe(3)
    expect(fp.numericRatio).toBe(0)
    expect(fp.min).toBeNull()
    expect(fp.max).toBeNull()
    expect(fp.mean).toBeNull()
  })

  it('handles mixed numeric/string', () => {
    const fp = computeFingerprint([1, 'two', 3, 'four', 5], 'col_3')
    expect(fp.nRows).toBe(5)
    expect(fp.numericRatio).toBe(0.6) // 3 of 5 are numeric
    expect(fp.nUnique).toBe(5)
  })

  it('handles empty column', () => {
    const fp = computeFingerprint([], 'col_empty')
    expect(fp.nRows).toBe(0)
    expect(fp.nMissing).toBe(0)
    expect(fp.nUnique).toBe(0)
    expect(fp.min).toBeNull()
    expect(fp.mean).toBeNull()
  })

  it('handles all-null column', () => {
    const fp = computeFingerprint([null, null, null], 'col_null')
    expect(fp.nRows).toBe(3)
    expect(fp.nMissing).toBe(3)
    expect(fp.nUnique).toBe(0)
    expect(fp.numericRatio).toBe(0)
  })

  it('produces deterministic hash for same data', () => {
    const fp1 = computeFingerprint([1, 2, 3], 'col_a')
    const fp2 = computeFingerprint([1, 2, 3], 'col_b')
    expect(fp1.hash).toBe(fp2.hash)
  })

  it('produces different hash for different data', () => {
    const fp1 = computeFingerprint([1, 2, 3], 'col_a')
    const fp2 = computeFingerprint([1, 2, 4], 'col_a')
    expect(fp1.hash).not.toBe(fp2.hash)
  })

  it('computes top values sorted by frequency', () => {
    const fp = computeFingerprint([1, 2, 2, 3, 3, 3, 4, 4, 4, 4], 'col_freq')
    expect(fp.topValues[0].value).toBe(4)
    expect(fp.topValues[0].count).toBe(4)
    expect(fp.topValues[1].value).toBe(3)
    expect(fp.topValues[1].count).toBe(3)
  })

  it('handles numeric strings as numbers', () => {
    const fp = computeFingerprint(['1', '2', '3'], 'col_str_num')
    expect(fp.numericRatio).toBe(1)
    expect(fp.min).toBe(1)
    expect(fp.max).toBe(3)
    expect(fp.mean).toBeCloseTo(2, 5)
  })

  it('sd = 0 for single value', () => {
    const fp = computeFingerprint([42], 'col_single')
    expect(fp.sd).toBe(0)
    expect(fp.mean).toBe(42)
  })
})

// ============================================================
// diffFingerprints
// ============================================================

describe('diffFingerprints', () => {
  it('detects no change for identical fingerprints', () => {
    const fp = computeFingerprint([1, 2, 3, 4, 5], 'col_0')
    const diff = diffFingerprints(fp, fp)
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(0)
    expect(diff.changed).toBe(0)
    expect(diff.prevHash).toBe(diff.nextHash)
  })

  it('detects added rows', () => {
    const prev = computeFingerprint([1, 2, 3], 'col_0')
    const next = computeFingerprint([1, 2, 3, 4, 5], 'col_0')
    const diff = diffFingerprints(prev, next)
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(0)
  })

  it('detects removed rows', () => {
    const prev = computeFingerprint([1, 2, 3, 4, 5], 'col_0')
    const next = computeFingerprint([1, 2, 3], 'col_0')
    const diff = diffFingerprints(prev, next)
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(2)
  })

  it('detects changed values (same row count)', () => {
    const prev = computeFingerprint([1, 2, 3, 4, 5], 'col_0')
    const next = computeFingerprint([1, 2, 3, 4, 99], 'col_0')
    const diff = diffFingerprints(prev, next)
    expect(diff.prevHash).not.toBe(diff.nextHash)
    expect(diff.changed).toBeGreaterThan(0)
  })
})

// ============================================================
// matchColumns
// ============================================================

describe('matchColumns', () => {
  it('matches columns with exact same data', () => {
    const source = [computeFingerprint([1, 2, 3], 'q1')]
    const target = [computeFingerprint([1, 2, 3], 'q1_renamed')]
    const matches = matchColumns(source, target)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(1.0)
    expect(matches[0].matchType).toBe('exact')
  })

  it('matches columns by name when data differs', () => {
    const source = [computeFingerprint([1, 2, 3], 'col_0')]
    const target = [computeFingerprint([4, 5, 6], 'col_0')]
    const matches = matchColumns(source, target)
    expect(matches).toHaveLength(1)
    expect(matches[0].matchType).toBe('name')
    expect(matches[0].confidence).toBe(0.8)
  })

  it('matches structurally similar columns', () => {
    // Same distribution shape, different values
    const source = [computeFingerprint([1, 2, 3, 4, 5, 1, 2, 3, 4, 5], 'src_col')]
    const target = [computeFingerprint([1, 2, 3, 4, 5, 1, 2, 3, 4, 6], 'tgt_col')]
    const matches = matchColumns(source, target)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBeGreaterThan(0.3)
    expect(matches[0].matchType).toBe('structure')
  })

  it('returns none for completely different columns', () => {
    const source = [computeFingerprint([1, 1, 1, 1, 1], 'src')]
    const target = [computeFingerprint(['a', 'b', 'c', 'd', 'e'], 'tgt')]
    const matches = matchColumns(source, target)
    expect(matches).toHaveLength(1)
    expect(matches[0].matchType).toBe('none')
    expect(matches[0].confidence).toBe(0)
  })

  it('handles multiple columns', () => {
    const source = [
      computeFingerprint([1, 2, 3], 'col_0'),
      computeFingerprint([4, 5, 6], 'col_1'),
    ]
    const target = [
      computeFingerprint([4, 5, 6], 'col_1'),
      computeFingerprint([1, 2, 3], 'col_0'),
    ]
    const matches = matchColumns(source, target)
    expect(matches).toHaveLength(2)
    // Both should be exact matches despite order swap
    const exactMatches = matches.filter((m) => m.matchType === 'exact')
    expect(exactMatches).toHaveLength(2)
  })
})

// ============================================================
// Integration: fingerprint in PasteGridAdapter
// ============================================================

describe('PasteGridAdapter fingerprint integration', () => {
  it('every parsed column has a fingerprint', () => {
    const raw = 'Name\tAge\tScore\nAlice\t30\t85\nBob\t25\t90'
    const result = PasteGridAdapter.parse(raw)
    expect(result.columns).toHaveLength(3)
    for (const col of result.columns) {
      expect(col.fingerprint).toBeDefined()
      expect(col.fingerprint.nRows).toBe(2)
      expect(col.fingerprint.hash).toBeTruthy()
    }
  })

  it('fingerprint stats are correct for parsed numeric column', () => {
    const raw = 'Score\n10\n20\n30\n40\n50'
    const result = PasteGridAdapter.parse(raw)
    const fp = result.columns[0].fingerprint
    expect(fp.numericRatio).toBe(1)
    expect(fp.min).toBe(10)
    expect(fp.max).toBe(50)
    expect(fp.mean).toBeCloseTo(30, 5)
    expect(fp.nMissing).toBe(0)
  })

  it('fingerprint handles empty cells as null', () => {
    const raw = 'Q1\n1\n\n3\n\n5'
    const result = PasteGridAdapter.parse(raw)
    const fp = result.columns[0].fingerprint
    expect(fp.nRows).toBe(5)
    expect(fp.nMissing).toBe(2)
  })
})
