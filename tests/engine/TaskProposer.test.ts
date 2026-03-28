/**
 * TaskProposer tests — verifies the three-pass proposal logic.
 */
import { describe, it, expect } from 'vitest'
import { proposeTasks, getPluginApplicability } from '../../src/engine/TaskProposer'
import type { QuestionBlock, ColumnDefinition } from '../../src/types/dataTypes'

// Register all plugins
import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/CrosstabPlugin'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/PostHocPlugin'
import '../../src/plugins/ReliabilityPlugin'
import '../../src/plugins/FactorPlugin'
import '../../src/plugins/RegressionPlugin'
import '../../src/plugins/DriverPlugin'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/PointBiserialPlugin'
import '../../src/plugins/SegmentProfilePlugin'

// ============================================================
// Helpers
// ============================================================

function makeCol(id: string, name: string, n: number, values?: (number | string | null)[]): ColumnDefinition {
  const vals = values ?? Array.from({ length: n }, (_, i) => (i % 5) + 1)
  return {
    id, name, type: 'rating', nRows: vals.length,
    nMissing: vals.filter((v) => v === null).length,
    rawValues: vals, fingerprint: null, semanticDetectionCache: null,
    transformStack: [], sensitivity: 'anonymous', declaredScaleRange: null,
  }
}

function makeBlock(
  id: string,
  label: string,
  type: QuestionBlock['questionType'],
  nCols: number,
  nRows: number = 50,
  role: QuestionBlock['role'] = 'question'
): QuestionBlock {
  const columns = Array.from({ length: nCols }, (_, i) =>
    makeCol(`${id}_c${i}`, `${label} Item ${i + 1}`, nRows)
  )
  return { id, label, questionType: type, columns, role, confirmed: true, pastedAt: Date.now() }
}

function makeSegmentBlock(id: string, n: number): QuestionBlock {
  const vals = Array.from({ length: n }, (_, i) => i < n / 2 ? 'A' : 'B')
  return {
    id, label: 'Segment', questionType: 'category',
    columns: [makeCol(`${id}_seg`, 'Segment', n, vals)],
    role: 'segment', confirmed: true, pastedAt: Date.now(),
  }
}

function taskPluginIds(tasks: ReturnType<typeof proposeTasks>): string[] {
  return tasks.map((t) => t.pluginId)
}

// ============================================================
// Pass 1: Within-question tasks
// ============================================================

describe('Pass 1: Within-question tasks', () => {
  it('rating (1 item) → frequency only', () => {
    const blocks = [makeBlock('q1', 'Overall SAT', 'rating', 1)]
    const tasks = proposeTasks(blocks)
    const ids = taskPluginIds(tasks)

    expect(ids).toContain('frequency')
    expect(ids).not.toContain('cronbach')
    expect(ids).not.toContain('correlation')
  })

  it('rating (1 item) + segment → frequency, crosstab, significance, profiles', () => {
    const blocks = [
      makeBlock('q1', 'Overall SAT', 'rating', 1),
      makeSegmentBlock('seg', 50),
    ]
    const tasks = proposeTasks(blocks)
    const ids = taskPluginIds(tasks)

    expect(ids).toContain('frequency')
    expect(ids).toContain('crosstab')
    expect(ids).toContain('kw_significance')
    expect(ids).toContain('segment_profile')
  })

  it('matrix (5 items) → frequency, reliability, correlation, factor analysis', () => {
    const blocks = [makeBlock('q2', 'Service Attrs', 'matrix', 5)]
    const tasks = proposeTasks(blocks)
    const ids = taskPluginIds(tasks)

    expect(ids).toContain('frequency')
    expect(ids).toContain('cronbach')
    expect(ids).toContain('correlation')
    expect(ids).toContain('efa')
  })

  it('matrix (3 items) → reliability and correlation but NOT factor analysis', () => {
    const blocks = [makeBlock('q2', 'Service Attrs', 'matrix', 3)]
    const tasks = proposeTasks(blocks)
    const ids = taskPluginIds(tasks)

    expect(ids).toContain('cronbach')
    expect(ids).toContain('correlation')
    expect(ids).not.toContain('efa')
  })

  it('checkbox → frequency only, NEVER means/regression/cronbach', () => {
    const blocks = [makeBlock('q3', 'Features Used', 'checkbox', 3)]
    const tasks = proposeTasks(blocks)
    const ids = taskPluginIds(tasks)

    expect(ids).toContain('frequency')
    expect(ids).not.toContain('cronbach')
    expect(ids).not.toContain('correlation')
    expect(ids).not.toContain('regression')
    expect(ids).not.toContain('driver_analysis')
  })

  it('checkbox + segment → frequency, crosstab', () => {
    const blocks = [
      makeBlock('q3', 'Features Used', 'checkbox', 3),
      makeSegmentBlock('seg', 50),
    ]
    const tasks = proposeTasks(blocks)
    const ids = taskPluginIds(tasks)

    expect(ids).toContain('frequency')
    expect(ids).toContain('crosstab')
    expect(ids).not.toContain('kw_significance') // not for checkbox
  })

  it('radio/category → frequency, never cronbach/regression', () => {
    const blocks = [makeBlock('q4', 'Gender', 'radio', 1)]
    const tasks = proposeTasks(blocks)
    const ids = taskPluginIds(tasks)

    expect(ids).toContain('frequency')
    expect(ids).not.toContain('cronbach')
    expect(ids).not.toContain('regression')
  })

  it('verbatim → nothing quantitative', () => {
    const blocks = [makeBlock('q5', 'Comments', 'verbatim', 1)]
    const tasks = proposeTasks(blocks)

    expect(tasks).toHaveLength(0)
  })

  it('behavioral-only → frequency is NOT proposed', () => {
    const blocks = [makeBlock('b1', 'Revenue Metrics', 'behavioral', 5)]
    const tasks = proposeTasks(blocks)
    const ids = taskPluginIds(tasks)

    expect(ids).not.toContain('frequency')
    expect(ids).not.toContain('crosstab')
    expect(ids).not.toContain('kw_significance')
    expect(ids).not.toContain('segment_profile')
    expect(ids).not.toContain('cronbach')
    // correlation is valid for 3+ behavioral items
    expect(ids).toContain('correlation')
  })

  it('behavioral + segment → no frequency/crosstab proposed', () => {
    const blocks = [
      makeBlock('b1', 'Revenue Metrics', 'behavioral', 3),
      makeSegmentBlock('seg', 50),
    ]
    const tasks = proposeTasks(blocks)
    const b1Tasks = tasks.filter((t) => t.sourceQuestionIds.includes('b1') && t.sourceQuestionIds.length === 1)
    const b1Ids = b1Tasks.map((t) => t.pluginId)

    expect(b1Ids).not.toContain('frequency')
    expect(b1Ids).not.toContain('crosstab')
    expect(b1Ids).not.toContain('kw_significance')
  })

  it('weight block → no tasks', () => {
    const blocks = [makeBlock('w', 'Weight', 'weight', 1, 50, 'weight')]
    const tasks = proposeTasks(blocks)

    expect(tasks).toHaveLength(0)
  })

  it('segment block → no tasks (segments are not analyzed as questions)', () => {
    const blocks = [makeSegmentBlock('seg', 50)]
    const tasks = proposeTasks(blocks)

    expect(tasks).toHaveLength(0)
  })
})

// ============================================================
// Pass 2: Cross-question tasks
// ============================================================

describe('Pass 2: Cross-question tasks', () => {
  it('single rating (outcome) + matrix block (predictors) → driver analysis', () => {
    const blocks = [
      makeBlock('q1', 'Overall SAT', 'rating', 1),
      makeBlock('q2', 'Service Attrs', 'matrix', 5),
    ]
    const tasks = proposeTasks(blocks)
    const driverTasks = tasks.filter((t) => t.pluginId === 'driver_analysis')

    expect(driverTasks).toHaveLength(1)
    expect(driverTasks[0].sourceQuestionIds).toContain('q1')
    expect(driverTasks[0].sourceQuestionIds).toContain('q2')
    expect(driverTasks[0].inputs.outcome).toBeDefined()
    expect(driverTasks[0].inputs.outcome!.questionBlockId).toBe('q1')
    expect(driverTasks[0].inputs.columns.length).toBe(5) // 5 predictor items
  })

  it('single rating + matrix → also proposes regression', () => {
    const blocks = [
      makeBlock('q1', 'Overall SAT', 'rating', 1),
      makeBlock('q2', 'Service Attrs', 'matrix', 3),
    ]
    const tasks = proposeTasks(blocks)
    const regTasks = tasks.filter((t) => t.pluginId === 'regression')

    expect(regTasks).toHaveLength(1)
    expect(regTasks[0].inputs.outcome).toBeDefined()
  })

  it('no single-item rating → no driver analysis proposed', () => {
    const blocks = [
      makeBlock('q1', 'Scale A', 'matrix', 5),
      makeBlock('q2', 'Scale B', 'matrix', 4),
    ]
    const tasks = proposeTasks(blocks)
    const driverTasks = tasks.filter((t) => t.pluginId === 'driver_analysis')

    expect(driverTasks).toHaveLength(0)
  })

  it('2+ numeric blocks → cross-question correlation', () => {
    const blocks = [
      makeBlock('q1', 'Scale A', 'rating', 3),
      makeBlock('q2', 'Scale B', 'matrix', 4),
    ]
    const tasks = proposeTasks(blocks)
    const corrTasks = tasks.filter(
      (t) => t.pluginId === 'correlation' && t.sourceQuestionIds.length > 1
    )

    expect(corrTasks).toHaveLength(1)
    expect(corrTasks[0].inputs.columns.length).toBe(7) // 3 + 4
  })

  it('checkbox + rating → point-biserial across questions', () => {
    const blocks = [
      makeBlock('q1', 'Used Feature', 'checkbox', 2),
      makeBlock('q2', 'Satisfaction', 'rating', 3),
    ]
    const tasks = proposeTasks(blocks)
    const pbTasks = tasks.filter((t) => t.pluginId === 'point_biserial')

    expect(pbTasks).toHaveLength(1)
    expect(pbTasks[0].sourceQuestionIds).toContain('q1')
    expect(pbTasks[0].sourceQuestionIds).toContain('q2')
  })

  it('behavioral predictors + rating outcome → driver analysis IS proposed', () => {
    const blocks = [
      makeBlock('q1', 'Overall Satisfaction', 'rating', 1),
      makeBlock('b1', 'Behavioral Metrics', 'behavioral', 5),
    ]
    const tasks = proposeTasks(blocks)
    const driverTasks = tasks.filter((t) => t.pluginId === 'driver_analysis')

    expect(driverTasks).toHaveLength(1)
    expect(driverTasks[0].inputs.outcome).toBeDefined()
    expect(driverTasks[0].inputs.outcome!.questionBlockId).toBe('q1')
    expect(driverTasks[0].inputs.columns.length).toBe(5) // 5 behavioral predictors
    expect(driverTasks[0].sourceQuestionIds).toContain('q1')
    expect(driverTasks[0].sourceQuestionIds).toContain('b1')
  })
})

// ============================================================
// Pass 3: Dependencies
// ============================================================

describe('Pass 3: Dependency wiring', () => {
  it('posthoc depends on significance for the same question', () => {
    const blocks = [
      makeBlock('q1', 'SAT', 'rating', 1),
      makeSegmentBlock('seg', 50),
    ]
    const tasks = proposeTasks(blocks)
    const sigTask = tasks.find((t) => t.pluginId === 'kw_significance')
    const phTask = tasks.find((t) => t.pluginId === 'posthoc')

    expect(sigTask).toBeDefined()
    expect(phTask).toBeDefined()
    expect(phTask!.dependsOn).toContain(sigTask!.id)
  })

  it('driver analysis depends on frequency tasks', () => {
    const blocks = [
      makeBlock('q1', 'Overall SAT', 'rating', 1),
      makeBlock('q2', 'Attrs', 'matrix', 3),
    ]
    const tasks = proposeTasks(blocks)
    const driverTask = tasks.find((t) => t.pluginId === 'driver_analysis')
    const freqTasks = tasks.filter((t) => t.pluginId === 'frequency')

    expect(driverTask).toBeDefined()
    expect(freqTasks.length).toBeGreaterThan(0)
    for (const ft of freqTasks) {
      expect(driverTask!.dependsOn).toContain(ft.id)
    }
  })
})

// ============================================================
// Task metadata
// ============================================================

describe('Task metadata', () => {
  it('every task has a label, reason, and status "proposed"', () => {
    const blocks = [
      makeBlock('q1', 'Overall SAT', 'rating', 1),
      makeBlock('q2', 'Service', 'matrix', 5),
      makeSegmentBlock('seg', 50),
    ]
    const tasks = proposeTasks(blocks)

    expect(tasks.length).toBeGreaterThan(5)

    for (const task of tasks) {
      expect(task.label.length).toBeGreaterThan(0)
      expect(task.reason.length).toBeGreaterThan(0)
      expect(task.status).toBe('proposed')
      expect(task.proposedBy).toBe('system')
      expect(task.sourceQuestionIds.length).toBeGreaterThan(0)
      expect(task.inputs.columns.length).toBeGreaterThan(0)
    }
  })

  it('cross-question tasks have multiple sourceQuestionIds', () => {
    const blocks = [
      makeBlock('q1', 'Overall SAT', 'rating', 1),
      makeBlock('q2', 'Service', 'matrix', 3),
    ]
    const tasks = proposeTasks(blocks)
    const crossTasks = tasks.filter((t) => t.sourceQuestionIds.length > 1)

    expect(crossTasks.length).toBeGreaterThan(0)
  })
})

// ============================================================
// getPluginApplicability
// ============================================================

describe('getPluginApplicability', () => {
  it('cronbach applicable to matrix with 3+ items', () => {
    const block = makeBlock('q1', 'Scale', 'matrix', 5)
    const result = getPluginApplicability(block, 'cronbach', false)
    expect(result.applicable).toBe(true)
  })

  it('cronbach NOT applicable to checkbox', () => {
    const block = makeBlock('q1', 'Features', 'checkbox', 3)
    const result = getPluginApplicability(block, 'cronbach', false)
    expect(result.applicable).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('crosstab NOT applicable without segment', () => {
    const block = makeBlock('q1', 'SAT', 'rating', 1)
    const result = getPluginApplicability(block, 'crosstab', false)
    expect(result.applicable).toBe(false)
    expect(result.reason).toContain('segment')
  })

  it('cronbach NOT applicable to single item', () => {
    const block = makeBlock('q1', 'SAT', 'rating', 1)
    const result = getPluginApplicability(block, 'cronbach', false)
    expect(result.applicable).toBe(false)
    expect(result.reason).toContain('2 items')
  })

  it('efa NOT applicable with < 3 items', () => {
    const block = makeBlock('q1', 'Scale', 'matrix', 2)
    const result = getPluginApplicability(block, 'efa', false)
    expect(result.applicable).toBe(false)
  })

  it('regression applicable to behavioral with n > 30', () => {
    const block = makeBlock('q1', 'Revenue', 'behavioral', 3, 50)
    const result = getPluginApplicability(block, 'regression', false)
    expect(result.applicable).toBe(true)
  })

  it('returns reason for nonexistent plugin', () => {
    const block = makeBlock('q1', 'SAT', 'rating', 1)
    const result = getPluginApplicability(block, 'nonexistent_plugin', false)
    expect(result.applicable).toBe(false)
    expect(result.reason).toContain('not found')
  })
})

// ============================================================
// Full scenario
// ============================================================

describe('Full scenario: typical market research dataset', () => {
  it('proposes correct tasks for SAT + attributes + checkbox + segment', () => {
    const blocks = [
      makeBlock('q1', 'Overall Satisfaction', 'rating', 1),
      makeBlock('q2', 'Service Attributes', 'matrix', 6),
      makeBlock('q3', 'Features Used', 'checkbox', 4),
      makeSegmentBlock('seg', 50),
    ]

    const tasks = proposeTasks(blocks)
    const ids = taskPluginIds(tasks)

    // Q1: frequency, crosstab, significance, profiles
    const q1Tasks = tasks.filter((t) => t.sourceQuestionIds.includes('q1') && t.sourceQuestionIds.length === 1)
    expect(q1Tasks.some((t) => t.pluginId === 'frequency')).toBe(true)
    expect(q1Tasks.some((t) => t.pluginId === 'crosstab')).toBe(true)
    expect(q1Tasks.some((t) => t.pluginId === 'kw_significance')).toBe(true)

    // Q2: frequency, crosstab, significance, reliability, correlation, factor analysis
    const q2Tasks = tasks.filter((t) => t.sourceQuestionIds.includes('q2') && t.sourceQuestionIds.length === 1)
    expect(q2Tasks.some((t) => t.pluginId === 'frequency')).toBe(true)
    expect(q2Tasks.some((t) => t.pluginId === 'cronbach')).toBe(true)
    expect(q2Tasks.some((t) => t.pluginId === 'efa')).toBe(true)

    // Q3: frequency, crosstab — NO reliability/regression
    const q3Tasks = tasks.filter((t) => t.sourceQuestionIds.includes('q3') && t.sourceQuestionIds.length === 1)
    expect(q3Tasks.some((t) => t.pluginId === 'frequency')).toBe(true)
    expect(q3Tasks.some((t) => t.pluginId === 'crosstab')).toBe(true)
    expect(q3Tasks.some((t) => t.pluginId === 'cronbach')).toBe(false)
    expect(q3Tasks.some((t) => t.pluginId === 'regression')).toBe(false)

    // Cross-question: driver (Q1 ~ Q2), point-biserial (Q3 × Q1/Q2)
    expect(ids).toContain('driver_analysis')
    expect(ids).toContain('point_biserial')

    // Cross-question correlation
    const crossCorr = tasks.filter((t) => t.pluginId === 'correlation' && t.sourceQuestionIds.length > 1)
    expect(crossCorr.length).toBeGreaterThan(0)
  })
})

// ============================================================
// Cross-type bridge proposals
// ============================================================

describe('TaskProposer — cross-type bridge', () => {
  function makeBehavioralBlock(id: string, name: string, n: number = 50): QuestionBlock {
    const vals = Array.from({ length: n }, (_, i) => i * 1.5 + Math.random())
    return {
      id, label: name, questionType: 'behavioral',
      columns: [{
        id: `${id}_c`, name, type: 'behavioral',
        nRows: n, nMissing: 0, nullMeaning: 'missing',
        rawValues: vals, fingerprint: null, semanticDetectionCache: null,
        transformStack: [], sensitivity: 'anonymous', declaredScaleRange: null,
      }],
      role: 'question', confirmed: true, pastedAt: Date.now(),
    }
  }

  it('proposes correlation with source cross_type_bridge when rating + behavioral exist', () => {
    const blocks = [
      makeBlock('r1', 'Satisfaction', 'rating', 1),
      makeBehavioralBlock('b1', 'games_played'),
      makeSegmentBlock('seg1', 50),
    ]
    const tasks = proposeTasks(blocks)
    const bridgeTasks = tasks.filter((t) => t.source === 'cross_type_bridge')
    expect(bridgeTasks.length).toBeGreaterThan(0)
    expect(bridgeTasks.some((t) => t.pluginId === 'correlation')).toBe(true)
  })

  it('proposes driver_analysis with source cross_type_bridge when outcome keyword + 2+ ratings exist', () => {
    const blocks = [
      makeBlock('r1', 'Trust', 'rating', 1),
      makeBlock('r2', 'Quality', 'rating', 1),
      makeBehavioralBlock('b1', 'gross_revenue'),
      makeSegmentBlock('seg1', 50),
    ]
    const tasks = proposeTasks(blocks)
    const bridgeDrivers = tasks.filter((t) => t.source === 'cross_type_bridge' && t.pluginId === 'driver_analysis')
    expect(bridgeDrivers.length).toBe(1)
    expect(bridgeDrivers[0].label).toContain('gross_revenue')
  })

  it('unconfirmed blocks are excluded from bridge proposals', () => {
    const unconfirmedRating: QuestionBlock = {
      ...makeBlock('r1', 'Satisfaction', 'rating', 1),
      confirmed: false,
    }
    const blocks = [
      unconfirmedRating,
      makeBehavioralBlock('b1', 'games_played'),
      makeSegmentBlock('seg1', 50),
    ]
    const tasks = proposeTasks(blocks)
    const bridgeTasks = tasks.filter((t) => t.source === 'cross_type_bridge')
    expect(bridgeTasks).toHaveLength(0)
  })

  it('total cross-type bridge proposals do not exceed 10', () => {
    // Many blocks — should cap
    const blocks = [
      ...Array.from({ length: 5 }, (_, i) => makeBlock(`r${i}`, `Rating ${i}`, 'rating', 1)),
      ...Array.from({ length: 5 }, (_, i) => makeBehavioralBlock(`b${i}`, `metric_${i}`)),
      makeSegmentBlock('seg1', 50),
    ]
    const tasks = proposeTasks(blocks)
    const bridgeTasks = tasks.filter((t) => t.source === 'cross_type_bridge')
    expect(bridgeTasks.length).toBeLessThanOrEqual(10)
  })
})
