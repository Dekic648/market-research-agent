/**
 * ColumnFingerprint — structural identity for a column of data.
 *
 * Computed once at parse time, never recomputed. If data changes,
 * a NEW fingerprint is computed for the new data.
 *
 * Three exported functions:
 *   computeFingerprint()  — build a fingerprint from raw values
 *   diffFingerprints()    — compare two fingerprints (re-paste detection)
 *   matchColumns()        — match columns across re-paste by structural similarity
 */

import type { ColumnFingerprint, FingerprintDiff } from '../types/dataTypes'

// ============================================================
// computeFingerprint
// ============================================================

/**
 * Compute a structural fingerprint for a column of raw values.
 * Pure function — no side effects, no DOM, no store access.
 */
export function computeFingerprint(
  values: (number | string | null)[],
  columnId: string
): ColumnFingerprint {
  const n = values.length
  let nMissing = 0
  let numericCount = 0
  const freqMap = new Map<string | number, number>()
  const nums: number[] = []

  for (let i = 0; i < n; i++) {
    const v = values[i]
    if (v === null || v === undefined) {
      nMissing++
      continue
    }
    const key = typeof v === 'number' ? v : v
    freqMap.set(key, (freqMap.get(key) ?? 0) + 1)

    if (typeof v === 'number') {
      nums.push(v)
      numericCount++
    } else {
      const parsed = parseFloat(v)
      if (!isNaN(parsed) && isFinite(parsed)) {
        nums.push(parsed)
        numericCount++
      }
    }
  }

  const nonMissing = n - nMissing
  const numericRatio = nonMissing > 0 ? numericCount / nonMissing : 0

  // Numeric stats
  let min: number | null = null
  let max: number | null = null
  let mean: number | null = null
  let sd: number | null = null

  if (nums.length > 0) {
    min = nums[0]
    max = nums[0]
    let sum = 0
    for (let i = 0; i < nums.length; i++) {
      if (nums[i] < min!) min = nums[i]
      if (nums[i] > max!) max = nums[i]
      sum += nums[i]
    }
    mean = sum / nums.length

    if (nums.length > 1) {
      let ss = 0
      for (let i = 0; i < nums.length; i++) {
        ss += (nums[i] - mean) * (nums[i] - mean)
      }
      sd = Math.sqrt(ss / (nums.length - 1))
    } else {
      sd = 0
    }
  }

  // Top values — sorted by frequency descending, take top 10
  const sorted = Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({ value, count }))

  // Hash — deterministic string hash of all non-null values in order
  const hash = computeHash(values)

  return {
    columnId,
    hash,
    nRows: n,
    nUnique: freqMap.size,
    nMissing,
    numericRatio,
    min,
    max,
    mean,
    sd,
    topValues: sorted,
    computedAt: Date.now(),
  }
}

// ============================================================
// diffFingerprints
// ============================================================

/**
 * Compare two fingerprints for the same logical column.
 * Used to detect what changed on re-paste.
 */
export function diffFingerprints(
  prev: ColumnFingerprint,
  next: ColumnFingerprint
): FingerprintDiff {
  const added = Math.max(0, next.nRows - prev.nRows)
  const removed = Math.max(0, prev.nRows - next.nRows)

  // Estimate changed values by comparing stats
  let changed = 0
  if (prev.hash !== next.hash) {
    // If hashes differ but row counts are the same, estimate changes
    // from the difference in unique value counts and distribution shifts
    if (prev.nRows === next.nRows) {
      // Use top-value overlap as a rough change estimator
      const prevTop = new Set(prev.topValues.map((tv) => String(tv.value)))
      const nextTop = new Set(next.topValues.map((tv) => String(tv.value)))
      let overlap = 0
      for (const v of prevTop) {
        if (nextTop.has(v)) overlap++
      }
      const maxTop = Math.max(prevTop.size, nextTop.size)
      const overlapRatio = maxTop > 0 ? overlap / maxTop : 1
      // Rough estimate: (1 - overlap%) of rows changed
      changed = Math.round(prev.nRows * (1 - overlapRatio))
    } else {
      changed = Math.abs(prev.nRows - next.nRows)
    }
  }

  return {
    columnId: next.columnId,
    added,
    removed,
    changed,
    prevHash: prev.hash,
    nextHash: next.hash,
  }
}

// ============================================================
// matchColumns
// ============================================================

export interface ColumnMatch {
  sourceId: string
  targetId: string
  confidence: number   // 0–1, how likely these are the same column
  matchType: 'exact' | 'name' | 'structure' | 'none'
}

/**
 * Match columns from a previous parse to a new parse.
 * Used for re-paste: migrates transform stacks to renamed columns.
 *
 * Matching priority:
 *   1. Exact hash match (same data) → confidence 1.0
 *   2. Name match (same column name) → confidence 0.8
 *   3. Structural similarity (same stats profile) → confidence 0.3–0.7
 *   4. No match → confidence 0
 */
export function matchColumns(
  source: ColumnFingerprint[],
  target: ColumnFingerprint[]
): ColumnMatch[] {
  const matches: ColumnMatch[] = []
  const usedTargets = new Set<string>()

  // Pass 1: exact hash matches
  for (const s of source) {
    for (const t of target) {
      if (usedTargets.has(t.columnId)) continue
      if (s.hash === t.hash) {
        matches.push({
          sourceId: s.columnId,
          targetId: t.columnId,
          confidence: 1.0,
          matchType: 'exact',
        })
        usedTargets.add(t.columnId)
        break
      }
    }
  }

  const matchedSources = new Set(matches.map((m) => m.sourceId))

  // Pass 2: name matches (columnId often encodes the name)
  for (const s of source) {
    if (matchedSources.has(s.columnId)) continue
    for (const t of target) {
      if (usedTargets.has(t.columnId)) continue
      if (s.columnId === t.columnId) {
        matches.push({
          sourceId: s.columnId,
          targetId: t.columnId,
          confidence: 0.8,
          matchType: 'name',
        })
        usedTargets.add(t.columnId)
        matchedSources.add(s.columnId)
        break
      }
    }
  }

  // Pass 3: structural similarity for remaining unmatched
  for (const s of source) {
    if (matchedSources.has(s.columnId)) continue

    let bestTarget: string | null = null
    let bestScore = 0

    for (const t of target) {
      if (usedTargets.has(t.columnId)) continue
      const score = structuralSimilarity(s, t)
      if (score > bestScore && score >= 0.3) {
        bestScore = score
        bestTarget = t.columnId
      }
    }

    if (bestTarget) {
      matches.push({
        sourceId: s.columnId,
        targetId: bestTarget,
        confidence: bestScore,
        matchType: 'structure',
      })
      usedTargets.add(bestTarget)
      matchedSources.add(s.columnId)
    } else {
      matches.push({
        sourceId: s.columnId,
        targetId: '',
        confidence: 0,
        matchType: 'none',
      })
    }
  }

  return matches
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Compute a deterministic hash of column values.
 * Uses a simple string hash (djb2) over the serialized values.
 */
function computeHash(values: (number | string | null)[]): string {
  let hash = 5381
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    const s = v === null ? '\0' : String(v)
    for (let j = 0; j < s.length; j++) {
      hash = ((hash << 5) + hash + s.charCodeAt(j)) | 0
    }
    // Separator between values
    hash = ((hash << 5) + hash + 31) | 0
  }
  // Convert to hex, handle negative values from int32 overflow
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Score structural similarity between two fingerprints (0–1).
 * Compares numeric ratio, unique count ratio, min/max range, and mean.
 */
function structuralSimilarity(a: ColumnFingerprint, b: ColumnFingerprint): number {
  let score = 0
  let factors = 0

  // Numeric ratio similarity
  const numDiff = Math.abs(a.numericRatio - b.numericRatio)
  score += 1 - numDiff
  factors++

  // Unique count ratio (relative to row count)
  const aUniqueRatio = a.nRows > 0 ? a.nUnique / a.nRows : 0
  const bUniqueRatio = b.nRows > 0 ? b.nUnique / b.nRows : 0
  const uniqueDiff = Math.abs(aUniqueRatio - bUniqueRatio)
  score += 1 - Math.min(uniqueDiff * 2, 1)
  factors++

  // Missing ratio
  const aMissRatio = a.nRows > 0 ? a.nMissing / a.nRows : 0
  const bMissRatio = b.nRows > 0 ? b.nMissing / b.nRows : 0
  const missDiff = Math.abs(aMissRatio - bMissRatio)
  score += 1 - Math.min(missDiff * 5, 1)
  factors++

  // Numeric stats comparison (if both have numeric data)
  if (a.mean !== null && b.mean !== null && a.sd !== null && b.sd !== null) {
    // Mean similarity (normalized by pooled SD)
    const pooledSD = Math.max((a.sd + b.sd) / 2, 0.001)
    const meanDiff = Math.abs(a.mean - b.mean) / pooledSD
    score += Math.max(0, 1 - meanDiff / 3)
    factors++

    // Range similarity
    if (a.min !== null && a.max !== null && b.min !== null && b.max !== null) {
      const aRange = a.max - a.min
      const bRange = b.max - b.min
      const maxRange = Math.max(aRange, bRange, 0.001)
      const rangeDiff = Math.abs(aRange - bRange) / maxRange
      score += 1 - Math.min(rangeDiff, 1)
      factors++
    }
  }

  // Top-value overlap
  const aTopSet = new Set(a.topValues.map((tv) => String(tv.value)))
  const bTopSet = new Set(b.topValues.map((tv) => String(tv.value)))
  if (aTopSet.size > 0 && bTopSet.size > 0) {
    let overlap = 0
    for (const v of aTopSet) {
      if (bTopSet.has(v)) overlap++
    }
    const maxSize = Math.max(aTopSet.size, bTopSet.size)
    score += overlap / maxSize
    factors++
  }

  return factors > 0 ? score / factors : 0
}
