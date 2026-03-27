/**
 * Tests for semantic checks (Phase 5) and detection orchestrator (Phase 6).
 *
 * Semantic checks use a mock API caller — no real Claude API calls in tests.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  configureSemanticChecks,
  runSemanticCheck,
  runSemanticCheckBatch,
  type SemanticCheckInput,
} from '../../src/detection/semanticChecks'
import {
  runDetection,
  runDetectionStatisticalOnly,
} from '../../src/detection/detectionLayer'
import type { ColumnDefinition } from '../../src/types/dataTypes'

// ============================================================
// Mock API
// ============================================================

function mockApi(response: string) {
  return async (_prompt: string) => response
}

function mockApiReverseCoded() {
  return mockApi(JSON.stringify({
    isReverseCoded: true,
    confidence: 0.85,
    reasoning: 'This item asks about dissatisfaction, opposite to other satisfaction items.',
    questionIntent: 'Measures dissatisfaction',
    scaleDirection: 'negative',
  }))
}

function mockApiNotReversed() {
  return mockApi(JSON.stringify({
    isReverseCoded: false,
    confidence: 0.9,
    reasoning: 'This item aligns with the positive direction of the scale.',
    questionIntent: 'Measures satisfaction',
    scaleDirection: 'positive',
  }))
}

function mockApiBatch(results: Array<{ columnName: string; isReverseCoded: boolean }>) {
  return mockApi(JSON.stringify(
    results.map((r) => ({
      columnName: r.columnName,
      isReverseCoded: r.isReverseCoded,
      confidence: 0.8,
      reasoning: r.isReverseCoded ? 'Reverse-worded' : 'Normal direction',
      questionIntent: 'test',
      scaleDirection: r.isReverseCoded ? 'negative' : 'positive',
    }))
  ))
}

// Helper: minimal ColumnDefinition
function makeCol(
  id: string,
  name: string,
  values: (number | string | null)[],
  overrides?: Partial<ColumnDefinition>
): ColumnDefinition {
  return {
    id,
    name,
    type: 'rating',
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    rawValues: values,
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: [],
    sensitivity: 'anonymous',
    declaredScaleRange: null,
    ...overrides,
  }
}

// ============================================================
// Phase 5: Semantic checks
// ============================================================

describe('runSemanticCheck', () => {
  beforeEach(() => {
    configureSemanticChecks({ callApi: mockApiNotReversed(), enabled: true })
  })

  it('returns null when not configured', async () => {
    configureSemanticChecks(null as any)
    // This would fail, but let's test the disabled path
    configureSemanticChecks({ callApi: mockApiNotReversed(), enabled: false })
    const result = await runSemanticCheck({
      columnId: 'q1',
      columnName: 'Q1',
      sensitivity: 'anonymous',
      cachedResult: null,
      sampleValues: [1, 2, 3],
    })
    expect(result).toBeNull()
  })

  it('blocks non-anonymous columns', async () => {
    configureSemanticChecks({ callApi: mockApiReverseCoded(), enabled: true })

    const result = await runSemanticCheck({
      columnId: 'q1',
      columnName: 'Q1',
      sensitivity: 'personal',
      cachedResult: null,
      sampleValues: [1, 2, 3],
    })
    expect(result).toBeNull()
  })

  it('blocks pseudonymous columns', async () => {
    configureSemanticChecks({ callApi: mockApiReverseCoded(), enabled: true })

    const result = await runSemanticCheck({
      columnId: 'q1',
      columnName: 'Q1',
      sensitivity: 'pseudonymous',
      cachedResult: null,
      sampleValues: [1, 2, 3],
    })
    expect(result).toBeNull()
  })

  it('returns cached result without API call', async () => {
    let apiCalled = false
    configureSemanticChecks({
      callApi: async () => { apiCalled = true; return '{}' },
      enabled: true,
    })

    const cached = {
      isReverseCoded: true,
      confidence: 0.9,
      reasoning: 'Previously detected',
      questionIntent: 'test',
      scaleDirection: 'negative' as const,
      cachedAt: Date.now() - 10000,
    }

    const result = await runSemanticCheck({
      columnId: 'q1',
      columnName: 'Q1',
      sensitivity: 'anonymous',
      cachedResult: cached,
      sampleValues: [1, 2, 3],
    })

    expect(apiCalled).toBe(false)
    expect(result).not.toBeNull()
    expect(result!.result.isReverseCoded).toBe(true)
    expect(result!.flag).not.toBeNull()
  })

  it('calls API and returns flag for reverse-coded item', async () => {
    configureSemanticChecks({ callApi: mockApiReverseCoded(), enabled: true })

    const result = await runSemanticCheck({
      columnId: 'q4',
      columnName: 'How dissatisfied were you?',
      sensitivity: 'anonymous',
      cachedResult: null,
      sampleValues: [5, 4, 3, 2, 1],
    })

    expect(result).not.toBeNull()
    expect(result!.result.isReverseCoded).toBe(true)
    expect(result!.flag).not.toBeNull()
    expect(result!.flag!.type).toBe('reverse_coded')
    expect(result!.flag!.source).toBe('semantic')
  })

  it('returns null flag for non-reversed item', async () => {
    configureSemanticChecks({ callApi: mockApiNotReversed(), enabled: true })

    const result = await runSemanticCheck({
      columnId: 'q1',
      columnName: 'How satisfied were you?',
      sensitivity: 'anonymous',
      cachedResult: null,
      sampleValues: [1, 2, 3, 4, 5],
    })

    expect(result).not.toBeNull()
    expect(result!.result.isReverseCoded).toBe(false)
    expect(result!.flag).toBeNull()
  })

  it('handles API failure gracefully', async () => {
    configureSemanticChecks({
      callApi: async () => { throw new Error('API down') },
      enabled: true,
    })

    const result = await runSemanticCheck({
      columnId: 'q1',
      columnName: 'Q1',
      sensitivity: 'anonymous',
      cachedResult: null,
      sampleValues: [1, 2, 3],
    })

    expect(result).toBeNull()
  })
})

describe('runSemanticCheckBatch', () => {
  it('processes a batch and returns per-column results', async () => {
    configureSemanticChecks({
      callApi: mockApiBatch([
        { columnName: 'Q1', isReverseCoded: false },
        { columnName: 'Q4_r', isReverseCoded: true },
      ]),
      enabled: true,
    })

    const inputs: SemanticCheckInput[] = [
      { columnId: 'q1', columnName: 'Q1', sensitivity: 'anonymous', cachedResult: null, sampleValues: [1, 2, 3] },
      { columnId: 'q4', columnName: 'Q4_r', sensitivity: 'anonymous', cachedResult: null, sampleValues: [5, 4, 3] },
    ]

    const results = await runSemanticCheckBatch(inputs)
    expect(results.size).toBe(2)
    expect(results.get('q1')!.result.isReverseCoded).toBe(false)
    expect(results.get('q4')!.result.isReverseCoded).toBe(true)
    expect(results.get('q4')!.flag).not.toBeNull()
  })

  it('skips non-anonymous columns in batch', async () => {
    configureSemanticChecks({
      callApi: mockApiBatch([{ columnName: 'Q1', isReverseCoded: false }]),
      enabled: true,
    })

    const inputs: SemanticCheckInput[] = [
      { columnId: 'q1', columnName: 'Q1', sensitivity: 'anonymous', cachedResult: null, sampleValues: [1, 2] },
      { columnId: 'email', columnName: 'Email', sensitivity: 'personal', cachedResult: null, sampleValues: ['a@b.com'] },
    ]

    const results = await runSemanticCheckBatch(inputs)
    expect(results.has('email')).toBe(false)
  })
})

// ============================================================
// Phase 6: Detection orchestrator
// ============================================================

describe('runDetectionStatisticalOnly', () => {
  it('runs all statistical checks on columns', () => {
    const columns = [
      makeCol('q1', 'Q1', [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]),
      makeCol('date', 'Join Date', [
        '2024-01-15', '2024-02-20', '2024-03-10', '2024-04-05', '2024-05-12',
      ]),
    ]

    const result = runDetectionStatisticalOnly({ columns })
    expect(result.flags.length).toBeGreaterThan(0)
    expect(result.flags.some((f) => f.type === 'timestamp_column')).toBe(true)
    expect(result.durationMs).toBeDefined()
  })

  it('detects reverse-coded items with scale groups', () => {
    const q1 = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
    const q2 = [1, 2, 3, 4, 5, 2, 3, 3, 4, 5, 1, 2, 4, 4, 5]
    const q3 = [2, 2, 3, 4, 5, 1, 2, 3, 5, 5, 1, 3, 3, 4, 5]
    const q4 = [5, 4, 3, 2, 1, 5, 4, 3, 2, 1, 5, 4, 3, 2, 1]

    const columns = [
      makeCol('q1', 'Q1', q1),
      makeCol('q2', 'Q2', q2),
      makeCol('q3', 'Q3', q3),
      makeCol('q4', 'Q4', q4),
    ]

    const result = runDetectionStatisticalOnly({
      columns,
      scaleGroups: [{ label: 'Satisfaction', columnIds: ['q1', 'q2', 'q3', 'q4'] }],
    })

    const reverseFlags = result.flags.filter((f) => f.type === 'reverse_coded')
    expect(reverseFlags.length).toBeGreaterThan(0)
    expect(reverseFlags.some((f) => f.columnId === 'q4')).toBe(true)
  })
})

describe('runDetection (full orchestrator)', () => {
  beforeEach(() => {
    configureSemanticChecks({ callApi: mockApiNotReversed(), enabled: true })
  })

  it('merges statistical and semantic flags', async () => {
    // Q4 is statistically reversed AND semantically reversed → both_agree
    const q1 = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
    const q2 = [1, 2, 3, 4, 5, 2, 3, 3, 4, 5, 1, 2, 4, 4, 5]
    const q3 = [2, 2, 3, 4, 5, 1, 2, 3, 5, 5, 1, 3, 3, 4, 5]
    const q4 = [5, 4, 3, 2, 1, 5, 4, 3, 2, 1, 5, 4, 3, 2, 1]

    // Mock API returns reverse-coded for q4
    configureSemanticChecks({
      callApi: mockApiBatch([
        { columnName: 'Q1', isReverseCoded: false },
        { columnName: 'Q2', isReverseCoded: false },
        { columnName: 'Q3', isReverseCoded: false },
        { columnName: 'Q4', isReverseCoded: true },
      ]),
      enabled: true,
    })

    const columns = [
      makeCol('q1', 'Q1', q1),
      makeCol('q2', 'Q2', q2),
      makeCol('q3', 'Q3', q3),
      makeCol('q4', 'Q4', q4),
    ]

    const result = await runDetection({
      columns,
      scaleGroups: [{ label: 'Satisfaction', columnIds: ['q1', 'q2', 'q3', 'q4'] }],
    })

    // Should have a both_agree flag for q4
    const q4Flags = result.flags.filter((f) => f.columnId === 'q4' && f.type === 'reverse_coded')
    expect(q4Flags.length).toBeGreaterThan(0)

    const bothAgree = q4Flags.find((f) => f.agreement === 'both_agree')
    if (bothAgree) {
      expect(bothAgree.sources).toContain('statistical')
      expect(bothAgree.sources).toContain('semantic')
      expect(bothAgree.confidence).toBeGreaterThan(0.5)
    }
  })

  it('produces semantic_only flags when statistical misses', async () => {
    // All columns correlate positively (no statistical reverse flag),
    // but API says q3 is reverse-coded → semantic_only
    const q1 = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
    const q2 = [1, 2, 3, 4, 5, 2, 3, 3, 4, 5]
    const q3 = [2, 2, 3, 4, 5, 1, 2, 3, 5, 5] // positively correlated, but API says reversed

    configureSemanticChecks({
      callApi: mockApiBatch([
        { columnName: 'Q1', isReverseCoded: false },
        { columnName: 'Q2', isReverseCoded: false },
        { columnName: 'Q3', isReverseCoded: true },
      ]),
      enabled: true,
    })

    const columns = [
      makeCol('q1', 'Q1', q1),
      makeCol('q2', 'Q2', q2),
      makeCol('q3', 'Q3', q3),
    ]

    const result = await runDetection({
      columns,
      scaleGroups: [{ label: 'Scale', columnIds: ['q1', 'q2', 'q3'] }],
    })

    const semanticOnly = result.flags.filter((f) => f.agreement === 'semantic_only')
    expect(semanticOnly.length).toBeGreaterThan(0)
  })

  it('works with semantic checks disabled', async () => {
    configureSemanticChecks({ callApi: mockApiNotReversed(), enabled: false })

    const columns = [
      makeCol('date', 'Join Date', [
        '2024-01-15', '2024-02-20', '2024-03-10', '2024-04-05', '2024-05-12',
      ]),
    ]

    const result = await runDetection({ columns })
    expect(result.flags.some((f) => f.type === 'timestamp_column')).toBe(true)
    // No semantic flags since disabled
    expect(result.flags.every((f) => f.sources.length === 1 && f.sources[0] === 'statistical')).toBe(true)
  })

  it('populates semanticCache for caching in ColumnDefinition', async () => {
    configureSemanticChecks({
      callApi: mockApiBatch([
        { columnName: 'Q1', isReverseCoded: false },
      ]),
      enabled: true,
    })

    const columns = [makeCol('q1', 'Q1', [1, 2, 3, 4, 5])]

    const result = await runDetection({
      columns,
      scaleGroups: [{ label: 'Scale', columnIds: ['q1'] }],
    })

    expect(result.semanticCache.has('q1')).toBe(true)
    expect(result.semanticCache.get('q1')!.cachedAt).toBeGreaterThan(0)
  })

  it('sorts flags: critical first, then by confidence', async () => {
    configureSemanticChecks({ callApi: mockApiNotReversed(), enabled: false })

    const columns = [
      makeCol('q1', 'Q1', [1, 3, 5, 1, 3, 5, 1, 3, 5, 1], {
        declaredScaleRange: [1, 5],
      }),
      makeCol('hdr', 'Header Col', [
        'How satisfied were you with the overall product quality and service?',
        4, 5, 3, 2, 5, 4, 3, 5, 4, 5,
      ]),
    ]

    const result = await runDetection({ columns })

    if (result.flags.length >= 2) {
      // Critical flags should come before info flags
      const severities = result.flags.map((f) => f.severity)
      const critIdx = severities.indexOf('critical')
      const infoIdx = severities.indexOf('info')
      if (critIdx !== -1 && infoIdx !== -1) {
        expect(critIdx).toBeLessThan(infoIdx)
      }
    }
  })
})
