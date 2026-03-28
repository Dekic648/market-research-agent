/**
 * Tests for three production fixes:
 *   Fix 1: Weak model R² threshold in summaryLanguage
 *   Fix 2: Cross-type task generation in analysisPlan
 *   Fix 3: Matrix/checkbox grouped bar chart with segment
 */
import { describe, it, expect } from 'vitest'
import type { ResolvedColumnData } from '../../src/plugins/types'
import type { ColumnDefinition, QuestionBlock } from '../../src/types/dataTypes'

// Register plugins
import '../../src/plugins/RegressionPlugin'
import '../../src/plugins/DriverPlugin'
import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/ANOVAPlugin'
import '../../src/plugins/LogisticRegressionPlugin'
import '../../src/plugins/DescriptivesPlugin'
import '../../src/plugins/DescriptivesSummaryPlugin'
import '../../src/plugins/SegmentProfilePlugin'
import '../../src/plugins/ReliabilityPlugin'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import { buildAnalysisPlan } from '../../src/engine/analysisPlan'

function makeCol(name: string, values: number[]) {
  return { id: `col_${name}`, name, values: values as (number | string | null)[], nullMeaning: 'missing' as const }
}

function makeSeg(name: string, labels: string[]) {
  return { id: `seg_${name}`, name, values: labels as (number | string | null)[], nullMeaning: 'missing' as const }
}

function makeBlockCol(name: string, overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    id: `col_${name}`, name,
    format: 'rating', statisticalType: 'ordinal', role: 'analyze',
    nRows: 100, nMissing: 0, nullMeaning: 'missing',
    rawValues: Array.from({ length: 100 }, (_, i) => (i % 5) + 1),
    fingerprint: null, semanticDetectionCache: null,
    transformStack: [], sensitivity: 'anonymous', declaredScaleRange: null,
    ...overrides,
  }
}

function makeBlock(
  id: string, label: string, columns: ColumnDefinition[],
  role: QuestionBlock['role'] = 'analyze', format: QuestionBlock['format'] = 'rating'
): QuestionBlock {
  return { id, label, format, columns, role, confirmed: true, pastedAt: Date.now() }
}

// ============================================================
// Fix 1 — Weak R² threshold
// ============================================================

describe('Fix 1 — Weak R² summaryLanguage', () => {
  const regression = AnalysisRegistry.get('regression')!

  it('R² = 0.02 → summaryLanguage does NOT name strongest predictor', async () => {
    // Create data where outcome is nearly random relative to predictors
    const n = 100
    const y = Array.from({ length: n }, (_, i) => Math.random() * 100)
    const x1 = Array.from({ length: n }, (_, i) => Math.random() * 100)
    const x2 = Array.from({ length: n }, (_, i) => Math.random() * 100)
    const data: ResolvedColumnData = {
      columns: [makeCol('Satisfaction', y), makeCol('Quality', x1), makeCol('Speed', x2)],
      n,
    }
    const result = await regression.run(data)
    const r2 = (result.data as any).result.R2

    if (r2 < 0.05) {
      const sl = result.findings[0]?.summaryLanguage ?? ''
      expect(sl).toContain('very little')
      expect(sl).not.toContain('strongest predictor')
    }
  })

  it('R² < 0.05 → yellow warning flag on finding', async () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => Math.random() * 100)
    const x1 = Array.from({ length: n }, (_, i) => Math.random() * 100)
    const data: ResolvedColumnData = {
      columns: [makeCol('Outcome', y), makeCol('Predictor', x1)],
      n,
    }
    const result = await regression.run(data)
    const r2 = (result.data as any).result.R2

    if (r2 < 0.05) {
      const flags = result.findings[0]?.flags ?? []
      const weakFlag = flags.find((f: any) => f.type === 'weak_model')
      expect(weakFlag).toBeDefined()
      expect(weakFlag?.severity).toBe('warning')
    }
  })

  it('R² > 0.15 → summaryLanguage names top predictor', async () => {
    // Create strongly correlated data
    const n = 100
    const x1 = Array.from({ length: n }, (_, i) => i)
    const y = x1.map((v) => v * 2 + Math.random() * 10)
    const x2 = Array.from({ length: n }, (_, i) => Math.random() * 50)
    const data: ResolvedColumnData = {
      columns: [makeCol('Outcome', y), makeCol('StrongPredictor', x1), makeCol('WeakPredictor', x2)],
      n,
    }
    const result = await regression.run(data)
    const r2 = (result.data as any).result.R2

    if (r2 > 0.15) {
      const sl = result.findings[0]?.summaryLanguage ?? ''
      expect(sl).toContain('strongest predictor')
    }
  })
})

// ============================================================
// Fix 2 — Cross-type tasks in analysisPlan
// ============================================================

describe('Fix 2 — Cross-type task generation', () => {
  it('behavioral metric × survey segment → KW tasks with crossType', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Quality', [makeBlockCol('Quality')]),
      makeBlock('b1', 'Revenue', [makeBlockCol('gross_revenue', {
        format: 'behavioral', statisticalType: 'continuous', role: 'metric',
        rawValues: Array.from({ length: 100 }, (_, i) => i * 10),
      })], 'metric', 'behavioral'),
      makeBlock('s1', 'Region', [makeBlockCol('Region', {
        format: 'category', statisticalType: 'categorical', role: 'segment',
        rawValues: Array.from({ length: 100 }, (_, i) => i < 50 ? 'North' : 'South'),
      })], 'segment', 'category'),
    ])
    const t2 = plan.tiers[1]
    const crossKW = t2.tasks.filter((t) => t.crossType && t.pluginId === 'kw_significance')
    expect(crossKW.length).toBeGreaterThan(0)
  })

  it('survey ordinal × behavioral dimension → KW tasks with crossType', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Quality', [makeBlockCol('Quality')]),
      makeBlock('b1', 'DPS', [makeBlockCol('DPS_tier', {
        format: 'category', statisticalType: 'categorical', role: 'dimension',
        rawValues: Array.from({ length: 100 }, (_, i) => i < 33 ? 'Low' : i < 66 ? 'Mid' : 'High'),
      })], 'metric', 'category'),
    ])
    const t2 = plan.tiers[1]
    const crossKW = t2.tasks.filter((t) => t.crossType)
    expect(crossKW.length).toBeGreaterThan(0)
  })

  it('survey × behavioral Spearman correlation tasks generated', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Survey', [makeBlockCol('Quality'), makeBlockCol('Speed')]),
      makeBlock('b1', 'Metrics', [makeBlockCol('gross_revenue', {
        format: 'behavioral', statisticalType: 'continuous', role: 'metric',
        rawValues: Array.from({ length: 100 }, (_, i) => i * 10),
      })], 'metric', 'behavioral'),
    ])
    const t3 = plan.tiers[2]
    const crossCorr = t3.tasks.filter((t) => t.crossType && t.pluginId === 'correlation')
    expect(crossCorr.length).toBeGreaterThan(0)
  })
})

// ============================================================
// Fix 3 — Matrix/checkbox grouped bar enforcement
// ============================================================

describe('Fix 3 — Matrix grouped bar chart with segment', () => {
  const frequency = AnalysisRegistry.get('frequency')!

  it('matrix columns + segment → grouped bar chart generated', async () => {
    const vals = Array.from({ length: 60 }, (_, i) => (i % 5) + 1)
    const segs = Array.from({ length: 60 }, (_, i) => i < 30 ? 'A' : 'B')
    const data: ResolvedColumnData = {
      columns: [{
        id: 'col1', name: 'Item1', values: vals, nullMeaning: 'missing',
        format: 'matrix',
      } as any],
      segment: { id: 'seg', name: 'Group', values: segs, nullMeaning: 'missing' },
      n: 60,
    }
    const result = await frequency.run(data)
    expect(result.charts.some((c) => c.type === 'groupedBar')).toBe(true)
  })

  it('grouped bar chart uses within-segment percentages', async () => {
    // Group A: all 5s. Group B: all 1s.
    const vals: number[] = [...Array(30).fill(5), ...Array(30).fill(1)]
    const segs = [...Array(30).fill('A'), ...Array(30).fill('B')]
    const data: ResolvedColumnData = {
      columns: [{
        id: 'col1', name: 'Score', values: vals, nullMeaning: 'missing',
        format: 'matrix',
      } as any],
      segment: { id: 'seg', name: 'Group', values: segs, nullMeaning: 'missing' },
      n: 60,
    }
    const result = await frequency.run(data)
    const groupedChart = result.charts.find((c) => c.type === 'groupedBar')
    expect(groupedChart).toBeDefined()
    // Group A trace should show 100% for value 5
    const traces = groupedChart!.data as any[]
    const groupA = traces.find((t) => t.name === 'A')
    expect(groupA).toBeDefined()
    // Value "5" should be 100% for group A
    const idx5 = groupA.x.indexOf('5')
    expect(groupA.y[idx5]).toBe(100)
  })
})
