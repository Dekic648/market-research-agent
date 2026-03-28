/**
 * Plugin system tests — AnalysisRegistry, CapabilityMatcher, and Batch 1 plugins.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import { CapabilityMatcher } from '../../src/engine/CapabilityMatcher'
import type { DatasetNode, ColumnDefinition } from '../../src/types/dataTypes'
import type { ResolvedColumnData, CapabilitySet } from '../../src/plugins/types'

// Import plugins to trigger self-registration
import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/CrosstabPlugin'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/PostHocPlugin'

// ============================================================
// Helpers
// ============================================================

function makeCol(
  id: string, name: string, type: ColumnDefinition['type'],
  values: (number | string | null)[]
): ColumnDefinition {
  return {
    id, name, type,
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    rawValues: values,
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: [],
    sensitivity: 'anonymous',
    declaredScaleRange: null,
  }
}

function makeNode(columns: ColumnDefinition[], segment?: ColumnDefinition): DatasetNode {
  return {
    id: 'node1',
    label: 'Test',
    parsedData: {
      groups: [{ questionType: columns[0]?.type ?? 'rating', columns, label: 'Test Group' }],
      segments: segment,
    },
    rowCount: columns[0]?.nRows ?? 0,
    weights: null,
    readonly: false,
    source: 'user',
    dataVersion: 1,
    createdAt: Date.now(),
  }
}

// ============================================================
// AnalysisRegistry
// ============================================================

describe('AnalysisRegistry', () => {
  it('has all 4 Batch 1 plugins registered', () => {
    expect(AnalysisRegistry.get('frequency')).toBeDefined()
    expect(AnalysisRegistry.get('crosstab')).toBeDefined()
    expect(AnalysisRegistry.get('kw_significance')).toBeDefined()
    expect(AnalysisRegistry.get('posthoc')).toBeDefined()
  })

  it('query returns plugins matching capabilities', () => {
    const caps: CapabilitySet = new Set(['categorical', 'ordinal', 'segment', 'n>30'])
    const plugins = AnalysisRegistry.query(caps)
    expect(plugins.length).toBeGreaterThanOrEqual(3)
    expect(plugins.some((p) => p.id === 'frequency')).toBe(true)
    expect(plugins.some((p) => p.id === 'crosstab')).toBe(true)
    expect(plugins.some((p) => p.id === 'kw_significance')).toBe(true)
  })

  it('query excludes plugins whose requirements are not met', () => {
    const caps: CapabilitySet = new Set(['categorical'])
    const plugins = AnalysisRegistry.query(caps)
    // CrosstabPlugin requires 'segment' — should not appear
    expect(plugins.some((p) => p.id === 'crosstab')).toBe(false)
  })

  it('queryOrdered resolves dependencies', () => {
    const caps: CapabilitySet = new Set(['categorical', 'ordinal', 'segment', 'n>30'])
    const ordered = AnalysisRegistry.queryOrdered(caps)
    const ids = ordered.map((p) => p.id)

    // PostHoc depends on SignificancePlugin — must come after
    const sigIdx = ids.indexOf('kw_significance')
    const phIdx = ids.indexOf('posthoc')
    if (sigIdx !== -1 && phIdx !== -1) {
      expect(sigIdx).toBeLessThan(phIdx)
    }
  })

  it('returns plugins sorted by priority', () => {
    const caps: CapabilitySet = new Set(['categorical', 'ordinal', 'segment', 'n>30'])
    const plugins = AnalysisRegistry.query(caps)
    for (let i = 1; i < plugins.length; i++) {
      expect(plugins[i].priority).toBeGreaterThanOrEqual(plugins[i - 1].priority)
    }
  })
})

// ============================================================
// CapabilityMatcher
// ============================================================

describe('CapabilityMatcher', () => {
  it('resolves ordinal + continuous from rating columns', () => {
    const node = makeNode([
      makeCol('q1', 'Q1', 'rating', [1, 2, 3, 4, 5]),
    ])
    const caps = CapabilityMatcher.resolve(node)
    expect(caps.has('ordinal')).toBe(true)
    expect(caps.has('continuous')).toBe(true)
  })

  it('resolves segment capability', () => {
    const seg = makeCol('seg', 'Segment', 'category', ['A', 'B', 'A', 'B', 'A'])
    const node = makeNode(
      [makeCol('q1', 'Q1', 'rating', [1, 2, 3, 4, 5])],
      seg
    )
    const caps = CapabilityMatcher.resolve(node)
    expect(caps.has('segment')).toBe(true)
  })

  it('resolves n>30 and n>100', () => {
    const values = Array.from({ length: 150 }, (_, i) => (i % 5) + 1)
    const node = makeNode([makeCol('q1', 'Q1', 'rating', values)])
    const caps = CapabilityMatcher.resolve(node)
    expect(caps.has('n>30')).toBe(true)
    expect(caps.has('n>100')).toBe(true)
  })

  it('resolves binary from 2-value column', () => {
    const node = makeNode([
      makeCol('q1', 'Q1', 'checkbox', [0, 1, 0, 1, 0, 1]),
    ])
    const caps = CapabilityMatcher.resolve(node)
    expect(caps.has('binary')).toBe(true)
  })

  it('resolves text capability from verbatim', () => {
    const node = makeNode([
      makeCol('q1', 'Q1', 'verbatim', ['great', 'bad', 'ok']),
    ])
    const caps = CapabilityMatcher.resolve(node)
    expect(caps.has('text')).toBe(true)
  })

  it('resolves categorical from radio/category', () => {
    const node = makeNode([
      makeCol('q1', 'Q1', 'category', ['A', 'B', 'C', 'A', 'B']),
    ])
    const caps = CapabilityMatcher.resolve(node)
    expect(caps.has('categorical')).toBe(true)
  })

  it('prefixed_ordinal emits categorical + ordinal + segment', () => {
    const col = makeCol('seg', 'Player Type', 'category', ['0) NonPayer', '1) ExPayer', '2) Minnow'])
    col.subtype = 'prefixed_ordinal'
    const caps = CapabilityMatcher.resolveFromColumns([col])
    expect(caps.has('categorical')).toBe(true)
    expect(caps.has('ordinal')).toBe(true)
    expect(caps.has('segment')).toBe(true)
  })

  it('geo emits categorical + segment, NOT ordinal', () => {
    const col = makeCol('geo', 'Country', 'category', ['US', 'UK', 'DE'])
    col.subtype = 'geo'
    const caps = CapabilityMatcher.resolveFromColumns([col])
    expect(caps.has('categorical')).toBe(true)
    expect(caps.has('segment')).toBe(true)
    expect(caps.has('ordinal')).toBe(false)
  })

  it('constant column emits nothing', () => {
    const col = makeCol('c', 'Const', 'category', ['US', 'US', 'US'])
    col.subtype = 'constant'
    const caps = CapabilityMatcher.resolveFromColumns([col])
    expect(caps.has('categorical')).toBe(false)
    expect(caps.has('ordinal')).toBe(false)
    expect(caps.has('segment')).toBe(false)
  })
})

// ============================================================
// FrequencyPlugin
// ============================================================

describe('FrequencyPlugin', () => {
  it('computes frequencies for a single column', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5] }],
      n: 10,
    }

    const plugin = AnalysisRegistry.get('frequency')!
    const result = await plugin.run(data)

    expect(result.pluginId).toBe('frequency')
    expect(result.charts.length).toBeGreaterThan(0)
    expect(result.findings.length).toBe(1)

    const freqs = (result.data as any).frequencies
    expect(freqs).toHaveLength(1)
    expect(freqs[0].n).toBe(10)
    expect(freqs[0].items).toHaveLength(5)
    expect(freqs[0].mean).toBeCloseTo(3.0, 1)
  })

  it('computes Top2Box and Bot2Box', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: [1, 1, 2, 4, 5, 5, 5, 5, 5, 5] }],
      n: 10,
    }

    const plugin = AnalysisRegistry.get('frequency')!
    const result = await plugin.run(data)
    const freq = (result.data as any).frequencies[0]

    expect(freq.top2box).toBeGreaterThan(50) // 7/10 are 4 or 5
    expect(freq.bot2box).toBeLessThan(40)    // 3/10 are 1 or 2
    expect(freq.netScore).toBeGreaterThan(0)
  })

  it('handles null values without crashing', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: [1, null, 3, null, 5] }],
      n: 5,
    }

    const plugin = AnalysisRegistry.get('frequency')!
    const result = await plugin.run(data)
    const freq = (result.data as any).frequencies[0]

    expect(freq.n).toBe(3)
    expect(freq.nMissing).toBe(2)
  })

  it('produces diverging chart for multiple ordinal columns', async () => {
    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Satisfaction', values: [1, 2, 3, 4, 5, 3, 4, 5, 4, 5] },
        { id: 'q2', name: 'Quality', values: [2, 3, 4, 5, 5, 4, 3, 4, 5, 4] },
      ],
      n: 10,
    }

    const plugin = AnalysisRegistry.get('frequency')!
    const result = await plugin.run(data)

    const diverging = result.charts.find((c) => c.type === 'divergingStackedBar')
    expect(diverging).toBeDefined()
  })

  it('generates plainLanguage', async () => {
    const plugin = AnalysisRegistry.get('frequency')!
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: [1, 2, 3, 4, 5] }],
      n: 5,
    }
    const result = await plugin.run(data)
    expect(result.plainLanguage.length).toBeGreaterThan(10)
  })
})

// ============================================================
// CrosstabPlugin
// ============================================================

describe('CrosstabPlugin', () => {
  it('produces cross-tabulation with segment', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: [1, 2, 3, 1, 2, 3, 1, 2, 3, 1] }],
      segment: { id: 'seg', name: 'Segment', values: ['A', 'A', 'A', 'B', 'B', 'B', 'A', 'B', 'A', 'B'] },
      n: 10,
    }

    const plugin = AnalysisRegistry.get('crosstab')!
    const result = await plugin.run(data)

    expect(result.pluginId).toBe('crosstab')
    const cts = (result.data as any).crosstabs
    expect(cts).toHaveLength(1)
    expect(cts[0].grandTotal).toBe(10)
    expect(cts[0].rowLabels.length).toBeGreaterThan(0)
    expect(cts[0].colLabels.length).toBe(2)
  })

  it('produces heatmap and grouped bar charts', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: [1, 2, 3, 1, 2, 3] }],
      segment: { id: 'seg', name: 'Segment', values: ['A', 'A', 'A', 'B', 'B', 'B'] },
      n: 6,
    }

    const plugin = AnalysisRegistry.get('crosstab')!
    const result = await plugin.run(data)

    expect(result.charts.some((c) => c.type === 'heatmap')).toBe(true)
    expect(result.charts.some((c) => c.type === 'groupedBar')).toBe(true)
  })
})

// ============================================================
// SignificancePlugin
// ============================================================

describe('SignificancePlugin', () => {
  it('detects significant difference across segments', async () => {
    // Group A has low values, Group B has high values
    const colValues = [1, 2, 1, 2, 1, 2, 1, 8, 9, 8, 9, 8, 9, 8]
    const segValues = ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B', 'B', 'B']

    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: colValues }],
      segment: { id: 'seg', name: 'Segment', values: segValues },
      n: 14,
    }

    const plugin = AnalysisRegistry.get('kw_significance')!
    const result = await plugin.run(data)

    const res = (result.data as any).results
    expect(res).toHaveLength(1)
    expect(res[0].p).toBeLessThan(0.05)
    expect(res[0].epsilonSquared).toBeGreaterThan(0)
  })

  it('produces significance map chart', async () => {
    const colValues = [1, 1, 1, 1, 1, 9, 9, 9, 9, 9]
    const segValues = ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B']

    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Q1', values: colValues },
        { id: 'q2', name: 'Q2', values: [3, 3, 3, 3, 3, 4, 4, 4, 4, 4] },
      ],
      segment: { id: 'seg', name: 'Segment', values: segValues },
      n: 10,
    }

    const plugin = AnalysisRegistry.get('kw_significance')!
    const result = await plugin.run(data)
    expect(result.charts.some((c) => c.type === 'significanceMap')).toBe(true)
  })

  it('checks minGroupSize precondition', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: [1, 2, 3] }],
      segment: { id: 'seg', name: 'Segment', values: ['A', 'A', 'B'] },
      n: 3,
    }

    const plugin = AnalysisRegistry.get('kw_significance')!
    const result = await plugin.run(data)
    expect(result.assumptions.some((a) => !a.passed)).toBe(true)
  })
})

// ============================================================
// PostHocPlugin
// ============================================================

describe('PostHocPlugin', () => {
  it('produces pairwise comparisons with Bonferroni', async () => {
    const data: ResolvedColumnData = {
      columns: [{
        id: 'q1', name: 'Q1',
        values: [1, 1, 2, 1, 2, 5, 5, 4, 5, 4, 3, 3, 3, 3, 3],
      }],
      segment: {
        id: 'seg', name: 'Segment',
        values: ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'C', 'C'],
      },
      n: 15,
    }

    const plugin = AnalysisRegistry.get('posthoc')!
    const result = await plugin.run(data)

    const res = (result.data as any).results
    expect(res).toHaveLength(1)
    expect(res[0].nComparisons).toBe(3) // 3 groups → 3 pairs
    expect(res[0].pairwise).toHaveLength(3)
    expect(res[0].groupLabels).toHaveLength(3)
  })

  it('produces means chart with CI', async () => {
    const data: ResolvedColumnData = {
      columns: [{
        id: 'q1', name: 'Q1',
        values: [1, 2, 1, 2, 1, 5, 4, 5, 4, 5],
      }],
      segment: {
        id: 'seg', name: 'Segment',
        values: ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B'],
      },
      n: 10,
    }

    const plugin = AnalysisRegistry.get('posthoc')!
    const result = await plugin.run(data)
    expect(result.charts.length).toBeGreaterThan(0)
    expect(result.charts[0].type).toBe('horizontalBar')
  })
})

// ============================================================
// Integration: CapabilityMatcher → AnalysisRegistry
// ============================================================

describe('CapabilityMatcher → AnalysisRegistry integration', () => {
  it('full pipeline: resolve node → query plugins → get runnable set', () => {
    const seg = makeCol('seg', 'Segment', 'category', ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B',
      'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B',
      'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A'])
    const values = Array.from({ length: 31 }, (_, i) => (i % 5) + 1)
    const node = makeNode([makeCol('q1', 'Q1', 'rating', values)], seg)

    const caps = CapabilityMatcher.resolve(node)
    expect(caps.has('ordinal')).toBe(true)
    expect(caps.has('segment')).toBe(true)
    expect(caps.has('n>30')).toBe(true)

    const plugins = AnalysisRegistry.queryOrdered(caps)
    const ids = plugins.map((p) => p.id)

    expect(ids).toContain('frequency')
    expect(ids).toContain('crosstab')
    expect(ids).toContain('kw_significance')
    expect(ids).toContain('posthoc')

    // Order: frequency before crosstab before significance before posthoc
    expect(ids.indexOf('frequency')).toBeLessThan(ids.indexOf('kw_significance'))
    expect(ids.indexOf('kw_significance')).toBeLessThan(ids.indexOf('posthoc'))
  })
})
