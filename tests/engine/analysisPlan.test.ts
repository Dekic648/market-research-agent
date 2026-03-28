/**
 * Tests for buildAnalysisPlan() — five-tier waterfall logic.
 */
import { describe, it, expect } from 'vitest'
import { buildAnalysisPlan, proposeTasksFromPlan } from '../../src/engine/analysisPlan'
import type { QuestionBlock, ColumnDefinition } from '../../src/types/dataTypes'

// Register plugins
import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/DescriptivesPlugin'
import '../../src/plugins/DescriptivesSummaryPlugin'
import '../../src/plugins/CrosstabPlugin'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/PostHocPlugin'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/ReliabilityPlugin'
import '../../src/plugins/FactorPlugin'
import '../../src/plugins/RegressionPlugin'
import '../../src/plugins/DriverPlugin'
import '../../src/plugins/LogisticRegressionPlugin'
import '../../src/plugins/ANOVAPlugin'
import '../../src/plugins/MediationPlugin'
import '../../src/plugins/ModerationPlugin'
import '../../src/plugins/PowerAnalysisPlugin'
import '../../src/plugins/SegmentProfilePlugin'

// ============================================================
// Helpers
// ============================================================

function makeCol(name: string, overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    id: `col_${name}`, name,
    format: 'rating', statisticalType: 'ordinal', role: 'analyze',
    type: 'rating',
    nRows: 100, nMissing: 0, nullMeaning: 'missing',
    rawValues: Array.from({ length: 100 }, (_, i) => (i % 5) + 1),
    fingerprint: null, semanticDetectionCache: null,
    transformStack: [], sensitivity: 'anonymous', declaredScaleRange: null,
    ...overrides,
  }
}

function makeBlock(
  id: string, label: string,
  columns: ColumnDefinition[],
  role: QuestionBlock['role'] = 'analyze',
  format: QuestionBlock['format'] = 'rating'
): QuestionBlock {
  return { id, label, format, columns, role, confirmed: true, pastedAt: Date.now() }
}

function makeBehavioralCol(name: string): ColumnDefinition {
  return makeCol(name, {
    format: 'behavioral', statisticalType: 'continuous', role: 'metric',
    rawValues: Array.from({ length: 100 }, (_, i) => i * 10 + Math.random()),
  })
}

function makeSegmentCol(name: string): ColumnDefinition {
  return makeCol(name, {
    format: 'category', statisticalType: 'categorical', role: 'segment',
    rawValues: Array.from({ length: 100 }, (_, i) => i < 50 ? 'A' : 'B'),
  })
}

function makeBinaryCol(name: string): ColumnDefinition {
  return makeCol(name, {
    format: 'checkbox', statisticalType: 'binary', role: 'analyze',
    rawValues: Array.from({ length: 100 }, (_, i) => i < 50 ? 0 : 1),
  })
}

function makeDimensionCol(name: string): ColumnDefinition {
  return makeCol(name, {
    format: 'category', statisticalType: 'categorical', role: 'dimension',
    rawValues: Array.from({ length: 100 }, (_, i) => i < 33 ? 'Low' : i < 66 ? 'Mid' : 'High'),
  })
}

// ============================================================
// Tier 1 — Distributions
// ============================================================

describe('Tier 1 — Distributions', () => {
  it('proposes descriptives_summary for 2+ ordinal columns', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Quality', [makeCol('Quality')]),
      makeBlock('q2', 'Speed', [makeCol('Speed')]),
    ])
    const t1 = plan.tiers[0]
    expect(t1.eligible).toBe(true)
    expect(t1.tasks.some((t) => t.pluginId === 'descriptives_summary')).toBe(true)
  })

  it('proposes descriptives (not frequency) for behavioral metrics', () => {
    const plan = buildAnalysisPlan([
      makeBlock('b1', 'Revenue', [makeBehavioralCol('revenue')], 'metric', 'behavioral'),
    ])
    const t1 = plan.tiers[0]
    expect(t1.tasks.some((t) => t.pluginId === 'descriptives')).toBe(true)
    expect(t1.tasks.some((t) => t.pluginId === 'frequency')).toBe(false)
  })

  it('proposes frequency for survey ordinal columns', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Satisfaction', [makeCol('Satisfaction')]),
    ])
    const t1 = plan.tiers[0]
    expect(t1.tasks.some((t) => t.pluginId === 'frequency')).toBe(true)
  })

  it('always eligible', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Q1', [makeCol('Q1')]),
    ])
    expect(plan.tiers[0].eligible).toBe(true)
  })
})

// ============================================================
// Tier 2 — Group Comparisons
// ============================================================

describe('Tier 2 — Group Comparisons', () => {
  it('eligible: false when no segment block', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Score', [makeCol('Score')]),
    ])
    expect(plan.tiers[1].eligible).toBe(false)
    expect(plan.tiers[1].reason).toContain('segment')
  })

  it('proposes kw_significance for survey ordinal + segment', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Score', [makeCol('Score')]),
      makeBlock('s1', 'Region', [makeSegmentCol('Region')], 'segment', 'category'),
    ])
    const t2 = plan.tiers[1]
    expect(t2.eligible).toBe(true)
    expect(t2.tasks.some((t) => t.pluginId === 'kw_significance')).toBe(true)
  })

  it('proposes anova_oneway for continuous + segment', () => {
    const plan = buildAnalysisPlan([
      makeBlock('b1', 'Revenue', [makeBehavioralCol('revenue')], 'metric', 'behavioral'),
      makeBlock('s1', 'Segment', [makeSegmentCol('Segment')], 'segment', 'category'),
    ])
    const t2 = plan.tiers[1]
    expect(t2.tasks.some((t) => t.pluginId === 'anova_oneway')).toBe(true)
  })

  it('marks behavioral metric + survey segment as crossType', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Score', [makeCol('Score')]),
      makeBlock('b1', 'Revenue', [makeBehavioralCol('revenue')], 'metric', 'behavioral'),
      makeBlock('s1', 'Region', [makeSegmentCol('Region')], 'segment', 'category'),
    ])
    const t2 = plan.tiers[1]
    const crossTypeTasks = t2.tasks.filter((t) => t.crossType)
    expect(crossTypeTasks.length).toBeGreaterThan(0)
  })

  it('marks survey ordinal + behavioral dimension as crossType', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Score', [makeCol('Score')]),
      makeBlock('b1', 'Tiers', [makeDimensionCol('DPS_tier')], 'metric', 'behavioral'),
    ])
    const t2 = plan.tiers[1]
    const crossTypeTasks = t2.tasks.filter((t) => t.crossType)
    expect(crossTypeTasks.length).toBeGreaterThan(0)
  })

  it('caps at 12 tasks', () => {
    // Many columns × many segments → should cap
    const cols = Array.from({ length: 5 }, (_, i) => makeCol(`Q${i}`))
    const segs = Array.from({ length: 3 }, (_, i) => makeSegmentCol(`Seg${i}`))
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Questions', cols),
      ...segs.map((s, i) => makeBlock(`s${i}`, `Seg${i}`, [s], 'segment', 'category')),
    ])
    expect(plan.tiers[1].tasks.length).toBeLessThanOrEqual(12)
  })
})

// ============================================================
// Tier 3 — Relationships
// ============================================================

describe('Tier 3 — Relationships', () => {
  it('eligible: false with 1 column only', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Q1', [makeCol('Q1')]),
    ])
    expect(plan.tiers[2].eligible).toBe(false)
    expect(plan.tiers[2].reason).toContain('more questions')
  })

  it('proposes correlation for 2 survey ordinals', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Quality', [makeCol('Quality')]),
      makeBlock('q2', 'Speed', [makeCol('Speed')]),
    ])
    const t3 = plan.tiers[2]
    expect(t3.eligible).toBe(true)
    expect(t3.tasks.some((t) => t.pluginId === 'correlation')).toBe(true)
  })

  it('proposes crossType correlation for survey + behavioral', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Quality', [makeCol('Quality')]),
      makeBlock('b1', 'Revenue', [makeBehavioralCol('revenue')], 'metric', 'behavioral'),
    ])
    const t3 = plan.tiers[2]
    const crossCorr = t3.tasks.filter((t) => t.crossType && t.pluginId === 'correlation')
    expect(crossCorr.length).toBeGreaterThan(0)
  })

  it('proposes cronbach for 3+ ordinal items in same block', () => {
    const cols = Array.from({ length: 4 }, (_, i) => makeCol(`Item${i}`))
    const plan = buildAnalysisPlan([makeBlock('q1', 'Scale', cols)])
    const t3 = plan.tiers[2]
    expect(t3.tasks.some((t) => t.pluginId === 'cronbach')).toBe(true)
  })

  it('proposes efa for 5+ ordinal items in same block', () => {
    const cols = Array.from({ length: 6 }, (_, i) => makeCol(`Item${i}`))
    const plan = buildAnalysisPlan([makeBlock('q1', 'Scale', cols)])
    const t3 = plan.tiers[2]
    expect(t3.tasks.some((t) => t.pluginId === 'efa')).toBe(true)
  })
})

// ============================================================
// Tier 4 — Prediction
// ============================================================

describe('Tier 4 — Prediction', () => {
  it('detects outcome from column name "Overall_Satisfaction"', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Attrs', [makeCol('Quality'), makeCol('Speed')]),
      makeBlock('q2', 'Outcome', [makeCol('Overall_Satisfaction')]),
    ])
    expect(plan.detectedOutcome).toBe('Overall_Satisfaction')
    expect(plan.tiers[3].eligible).toBe(true)
  })

  it('detects spend column as behavioral outcome', () => {
    const spendCol = makeBehavioralCol('gross_revenue')
    spendCol.statisticalType = 'spend'
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Survey', [makeCol('Quality'), makeCol('Speed')]),
      makeBlock('b1', 'Revenue', [spendCol], 'metric', 'behavioral'),
    ])
    expect(plan.detectedOutcome).toBe('gross_revenue')
  })

  it('proposes regression crossType for behavioral outcome + survey predictors', () => {
    const spendCol = makeBehavioralCol('revenue')
    spendCol.statisticalType = 'spend'
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Survey', [makeCol('Quality'), makeCol('Speed')]),
      makeBlock('b1', 'Revenue', [spendCol], 'metric', 'behavioral'),
    ])
    const t4 = plan.tiers[3]
    const crossReg = t4.tasks.filter((t) => t.crossType && t.pluginId === 'regression')
    expect(crossReg.length).toBeGreaterThan(0)
  })

  it('proposes logistic_regression for binary outcome', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Survey', [makeCol('Quality'), makeCol('Speed')]),
      makeBlock('q2', 'Converted', [makeBinaryCol('converted')]),
    ])
    const t4 = plan.tiers[3]
    expect(t4.tasks.some((t) => t.pluginId === 'logistic_regression')).toBe(true)
  })

  it('eligible: false when no detectable outcome', () => {
    // All columns have generic names, multiple columns per block
    const cols = Array.from({ length: 5 }, (_, i) => makeCol(`Item${i}`))
    const plan = buildAnalysisPlan([makeBlock('q1', 'Scale', cols)])
    expect(plan.tiers[3].eligible).toBe(false)
    expect(plan.tiers[3].reason).toContain('outcome')
  })

  it('proposes driver_analysis for survey outcome + survey predictors', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Attrs', [makeCol('Quality'), makeCol('Speed'), makeCol('Value')]),
      makeBlock('q2', 'Overall', [makeCol('Overall_Satisfaction')]),
    ])
    const t4 = plan.tiers[3]
    expect(t4.tasks.some((t) => t.pluginId === 'driver_analysis')).toBe(true)
  })
})

// ============================================================
// Tier 5 — Advanced
// ============================================================

describe('Tier 5 — Advanced', () => {
  it('always eligible', () => {
    const plan = buildAnalysisPlan([makeBlock('q1', 'Q1', [makeCol('Q1')])])
    expect(plan.tiers[4].eligible).toBe(true)
  })

  it('all tasks require confirmation', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Q1', [makeCol('Q1'), makeCol('Q2'), makeCol('Q3')]),
    ])
    const t5 = plan.tiers[4]
    for (const task of t5.tasks) {
      expect(task.requiresConfirmation).toBe(true)
    }
  })

  it('moderation never appears in Tiers 1-4', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Survey', [makeCol('Quality'), makeCol('Speed'), makeCol('Value')]),
      makeBlock('q2', 'Overall', [makeCol('Overall_Satisfaction')]),
      makeBlock('s1', 'Seg', [makeSegmentCol('Region')], 'segment', 'category'),
    ])
    for (let i = 0; i < 4; i++) {
      expect(plan.tiers[i].tasks.every((t) => t.pluginId !== 'moderation_analysis')).toBe(true)
    }
  })
})

// ============================================================
// proposeTasksFromPlan
// ============================================================

describe('proposeTasksFromPlan', () => {
  it('excludes unconfirmed Tier 5 tasks', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Q1', [makeCol('Q1'), makeCol('Q2'), makeCol('Q3')]),
    ])
    const tasks = proposeTasksFromPlan(plan)
    expect(tasks.every((t) => !t.requiresConfirmation)).toBe(true)
  })

  it('includes Tier 5 task when explicitly confirmed', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Q1', [makeCol('Q1'), makeCol('Q2'), makeCol('Q3')]),
    ])
    // Confirm a Tier 5 task
    const t5 = plan.tiers[4]
    if (t5.tasks.length > 0) {
      t5.tasks[0].status = 'confirmed'
    }
    const tasks = proposeTasksFromPlan(plan)
    expect(tasks.some((t) => t.requiresConfirmation)).toBe(true)
  })
})

// ============================================================
// Cross-type detection
// ============================================================

describe('Cross-type detection', () => {
  it('behavioral metric alone produces no cross-type proposals', () => {
    const plan = buildAnalysisPlan([
      makeBlock('b1', 'Revenue', [makeBehavioralCol('revenue')], 'metric', 'behavioral'),
    ])
    for (const tier of plan.tiers) {
      expect(tier.tasks.every((t) => !t.crossType)).toBe(true)
    }
  })

  it('mixed blocks produce crossType tasks', () => {
    const plan = buildAnalysisPlan([
      makeBlock('q1', 'Survey', [makeCol('Quality')]),
      makeBlock('b1', 'Revenue', [makeBehavioralCol('revenue')], 'metric', 'behavioral'),
      makeBlock('s1', 'Seg', [makeSegmentCol('Region')], 'segment', 'category'),
    ])
    const allTasks = plan.tiers.flatMap((t) => t.tasks)
    expect(allTasks.some((t) => t.crossType)).toBe(true)
  })
})
