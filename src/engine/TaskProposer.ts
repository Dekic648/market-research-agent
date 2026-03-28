/**
 * TaskProposer — proposes AnalysisTasks from QuestionBlocks.
 *
 * Three-pass proposal:
 *   Pass 1: Within-question tasks (frequency, reliability, etc.)
 *   Pass 2: Cross-question tasks (driver analysis, cross-scale correlation)
 *   Pass 3: Dependency wiring (posthoc depends on significance, etc.)
 *
 * This is the ONLY place that knows about question structure.
 * Plugins never know how they were proposed.
 * CapabilityMatcher is still consulted to gate proposals.
 */

import type { QuestionBlock, AnalysisTask, ColumnRef, QuestionType } from '../types/dataTypes'
import { CapabilityMatcher } from './CapabilityMatcher'
import { AnalysisRegistry } from '../plugins/AnalysisRegistry'

// ============================================================
// Public API
// ============================================================

/**
 * Propose analysis tasks for a set of question blocks.
 * Returns tasks in execution order with dependencies wired.
 */
export function proposeTasks(
  blocks: QuestionBlock[],
): AnalysisTask[] {
  const questions = blocks.filter((b) => b.role === 'question')
  const segmentBlock = blocks.find((b) => b.role === 'segment') ?? null
  const hasSegment = segmentBlock !== null

  const tasks: AnalysisTask[] = []
  let taskCounter = 0

  function nextId(pluginId: string): string {
    return `task_${pluginId}_${++taskCounter}`
  }

  // ---- Pass 1: Within-question tasks ----
  for (const block of questions) {
    const colRefs = block.columns.map((c) => ref(block.id, c.id))
    const segRef = segmentBlock
      ? ref(segmentBlock.id, segmentBlock.columns[0]?.id ?? segmentBlock.id)
      : undefined
    const nItems = block.columns.length
    const plan = WITHIN_QUESTION_RULES[block.questionType]

    if (!plan) continue

    // Always
    for (const pluginId of plan.always) {
      if (!pluginExists(pluginId)) continue
      tasks.push(makeTask(nextId(pluginId), pluginId, block, colRefs, undefined, segRef, undefined))
    }

    // With segment
    if (hasSegment) {
      for (const pluginId of plan.withSegment) {
        if (!pluginExists(pluginId)) continue
        tasks.push(makeTask(nextId(pluginId), pluginId, block, colRefs, segRef, segRef, undefined))
      }
    }

    // With multiple items (3+)
    if (nItems >= 3) {
      for (const pluginId of plan.withMultipleItems) {
        if (!pluginExists(pluginId)) continue
        tasks.push(makeTask(nextId(pluginId), pluginId, block, colRefs, undefined, segRef, undefined))
      }
    }

    // With many items (5+)
    if (nItems >= 5 && plan.withManyItems) {
      for (const pluginId of plan.withManyItems) {
        if (!pluginExists(pluginId)) continue
        tasks.push(makeTask(nextId(pluginId), pluginId, block, colRefs, undefined, segRef, undefined))
      }
    }
  }

  // ---- Pass 2: Cross-question tasks ----

  // Driver analysis: single-item rating (outcome) + multi-item scales (predictors)
  const singleRatings = questions.filter(
    (b) => (b.questionType === 'rating' || b.questionType === 'behavioral') && b.columns.length === 1
  )
  const multiItemScales = questions.filter(
    (b) => (b.questionType === 'rating' || b.questionType === 'matrix' || b.questionType === 'behavioral') && b.columns.length >= 2
  )

  for (const outcomeBlock of singleRatings) {
    if (multiItemScales.length === 0) continue

    // Collect all predictor columns from multi-item scales
    const predictorRefs: ColumnRef[] = []
    const sourceIds: string[] = [outcomeBlock.id]

    for (const predBlock of multiItemScales) {
      for (const col of predBlock.columns) {
        predictorRefs.push(ref(predBlock.id, col.id))
      }
      sourceIds.push(predBlock.id)
    }

    // Need n > 30 — check from outcome block
    if (outcomeBlock.columns[0]?.nRows > 30 && pluginExists('driver_analysis')) {
      const outcomeRef = ref(outcomeBlock.id, outcomeBlock.columns[0].id)
      tasks.push({
        id: nextId('driver_analysis'),
        pluginId: 'driver_analysis',
        label: `Driver: ${outcomeBlock.label} ~ ${multiItemScales.map((b) => b.label).join(' + ')}`,
        inputs: {
          columns: predictorRefs,
          outcome: outcomeRef,
        },
        sourceQuestionIds: sourceIds,
        dependsOn: [],
        proposedBy: 'system',
        reason: `Single-item rating "${outcomeBlock.label}" with ${multiItemScales.length} multi-item scale(s) → key driver analysis`,
        status: 'proposed',
      })
    }

    // Also propose regression (same shape, different plugin)
    if (outcomeBlock.columns[0]?.nRows > 30 && pluginExists('regression')) {
      const outcomeRef = ref(outcomeBlock.id, outcomeBlock.columns[0].id)
      tasks.push({
        id: nextId('regression'),
        pluginId: 'regression',
        label: `Regression: ${outcomeBlock.label} ~ ${multiItemScales.map((b) => b.label).join(' + ')}`,
        inputs: {
          columns: predictorRefs,
          outcome: outcomeRef,
        },
        sourceQuestionIds: [outcomeBlock.id, ...multiItemScales.map((b) => b.id)],
        dependsOn: [],
        proposedBy: 'system',
        reason: `Single-item outcome with multiple predictors → linear regression`,
        status: 'proposed',
      })
    }
  }

  // Cross-scale correlation: 2+ rating/matrix blocks
  const correlableBlocks = questions.filter(
    (b) => (b.questionType === 'rating' || b.questionType === 'matrix' || b.questionType === 'behavioral')
      && b.columns.length >= 1
  )
  if (correlableBlocks.length >= 2 && pluginExists('correlation')) {
    const allCorrelRefs: ColumnRef[] = []
    const sourceIds: string[] = []
    for (const block of correlableBlocks) {
      for (const col of block.columns) {
        allCorrelRefs.push(ref(block.id, col.id))
      }
      sourceIds.push(block.id)
    }
    tasks.push({
      id: nextId('correlation'),
      pluginId: 'correlation',
      label: `Cross-question Correlation: ${correlableBlocks.map((b) => b.label).join(', ')}`,
      inputs: { columns: allCorrelRefs },
      sourceQuestionIds: sourceIds,
      dependsOn: [],
      proposedBy: 'system',
      reason: `${correlableBlocks.length} numeric question blocks → cross-question correlation matrix`,
      status: 'proposed',
    })
  }

  // Point-biserial: binary block + continuous blocks
  const binaryBlocks = questions.filter(
    (b) => b.questionType === 'checkbox' && b.columns.length >= 1
  )
  const continuousBlocks = questions.filter(
    (b) => (b.questionType === 'rating' || b.questionType === 'matrix' || b.questionType === 'behavioral')
      && b.columns.length >= 1
  )
  if (binaryBlocks.length > 0 && continuousBlocks.length > 0 && pluginExists('point_biserial')) {
    const allRefs: ColumnRef[] = []
    const sourceIds: string[] = []
    for (const bb of binaryBlocks) {
      for (const col of bb.columns) allRefs.push(ref(bb.id, col.id))
      sourceIds.push(bb.id)
    }
    for (const cb of continuousBlocks) {
      for (const col of cb.columns) allRefs.push(ref(cb.id, col.id))
      sourceIds.push(cb.id)
    }
    tasks.push({
      id: nextId('point_biserial'),
      pluginId: 'point_biserial',
      label: `Point-Biserial: ${binaryBlocks.map((b) => b.label).join(', ')} × ${continuousBlocks.map((b) => b.label).join(', ')}`,
      inputs: { columns: allRefs },
      sourceQuestionIds: sourceIds,
      dependsOn: [],
      proposedBy: 'system',
      reason: `Binary variable(s) with continuous variable(s) → point-biserial correlation`,
      status: 'proposed',
    })
  }

  // ---- Pass 3: Dependency wiring ----
  wireDependencies(tasks)

  return tasks
}

/**
 * Check whether a specific plugin can run on given columns.
 * Returns applicability with human-readable reason.
 */
export function getPluginApplicability(
  block: QuestionBlock,
  pluginId: string,
  hasSegment: boolean
): { applicable: boolean; reason: string } {
  const plugin = AnalysisRegistry.get(pluginId)
  if (!plugin) return { applicable: false, reason: 'Plugin not found' }

  // Check capability match
  const caps = CapabilityMatcher.resolveFromColumns(block.columns)
  const missingCaps = plugin.requires.filter((r) => !caps.has(r))

  if (missingCaps.length > 0) {
    return {
      applicable: false,
      reason: `Requires: ${missingCaps.join(', ')}`,
    }
  }

  // Check question-type rules
  const rules = WITHIN_QUESTION_RULES[block.questionType]
  if (rules?.never.includes(pluginId)) {
    return {
      applicable: false,
      reason: `Not applicable to ${block.questionType} questions`,
    }
  }

  // Check segment requirement
  if (plugin.requires.includes('segment' as any) && !hasSegment) {
    return {
      applicable: false,
      reason: 'Requires a segment variable',
    }
  }

  // Check item count
  if (['cronbach', 'correlation'].includes(pluginId) && block.columns.length < 2) {
    return { applicable: false, reason: 'Requires at least 2 items' }
  }
  if (pluginId === 'efa' && block.columns.length < 3) {
    return { applicable: false, reason: 'Requires at least 3 items' }
  }

  // Check preconditions
  for (const validator of plugin.preconditions) {
    const n = block.columns[0]?.nRows ?? 0
    if (validator.name === 'minN(100)' && n < 100) {
      return { applicable: false, reason: `Requires n ≥ 100 (current: ${n})` }
    }
    if (validator.name === 'minGroupSize(5)' && !hasSegment) {
      return { applicable: false, reason: 'Requires segment with ≥ 5 per group' }
    }
  }

  return { applicable: true, reason: '' }
}

// ============================================================
// Within-question rules matrix
// ============================================================

interface QuestionRules {
  always: string[]
  withSegment: string[]
  withMultipleItems: string[]   // 3+ columns
  withManyItems?: string[]      // 5+ columns
  never: string[]
}

const WITHIN_QUESTION_RULES: Partial<Record<QuestionType, QuestionRules>> = {
  rating: {
    always: ['frequency'],
    withSegment: ['crosstab', 'kw_significance', 'segment_profile'],
    withMultipleItems: ['cronbach', 'correlation'],
    withManyItems: ['efa'],
    never: [],
  },
  matrix: {
    always: ['frequency'],
    withSegment: ['crosstab', 'kw_significance', 'segment_profile'],
    withMultipleItems: ['cronbach', 'correlation'],
    withManyItems: ['efa'],
    never: [],
  },
  checkbox: {
    always: ['frequency'],
    withSegment: ['crosstab'],
    withMultipleItems: [],
    never: ['cronbach', 'correlation', 'regression', 'driver_analysis', 'efa'],
  },
  radio: {
    always: ['frequency'],
    withSegment: ['crosstab', 'kw_significance'],
    withMultipleItems: [],
    never: ['cronbach', 'correlation', 'regression', 'driver_analysis', 'efa'],
  },
  category: {
    always: ['frequency'],
    withSegment: ['crosstab'],
    withMultipleItems: [],
    never: ['cronbach', 'correlation', 'regression', 'driver_analysis', 'efa'],
  },
  behavioral: {
    always: [],
    withSegment: [],
    withMultipleItems: ['correlation'],
    never: ['frequency', 'crosstab', 'kw_significance',
            'cronbach', 'efa', 'segment_profile', 'posthoc'],
  },
  verbatim: {
    always: [],
    withSegment: [],
    withMultipleItems: [],
    never: ['frequency', 'cronbach', 'correlation', 'regression', 'driver_analysis',
            'efa', 'crosstab', 'kw_significance', 'posthoc', 'segment_profile', 'point_biserial'],
  },
  timestamped: {
    always: [],
    withSegment: [],
    withMultipleItems: [],
    never: ['frequency', 'cronbach', 'efa'],
  },
  multi_assigned: {
    always: ['frequency'],
    withSegment: ['crosstab'],
    withMultipleItems: [],
    never: ['cronbach', 'correlation', 'regression', 'driver_analysis', 'efa'],
  },
  weight: {
    always: [],
    withSegment: [],
    withMultipleItems: [],
    never: ['frequency', 'cronbach', 'correlation', 'regression', 'driver_analysis',
            'efa', 'crosstab', 'kw_significance', 'posthoc', 'segment_profile', 'point_biserial'],
  },
}

// ============================================================
// Helpers
// ============================================================

function ref(questionBlockId: string, columnId: string): ColumnRef {
  return { questionBlockId, columnId }
}

function pluginExists(id: string): boolean {
  return AnalysisRegistry.get(id) !== undefined
}

function makeTask(
  id: string,
  pluginId: string,
  block: QuestionBlock,
  colRefs: ColumnRef[],
  segRef: ColumnRef | undefined,
  _segForInputs: ColumnRef | undefined,
  outcomeRef: ColumnRef | undefined,
): AnalysisTask {
  const rules = WITHIN_QUESTION_RULES[block.questionType]
  const isSegmentPlugin = ['crosstab', 'kw_significance', 'posthoc', 'segment_profile'].includes(pluginId)

  return {
    id,
    pluginId,
    label: `${pluginLabel(pluginId)}: ${block.label}`,
    inputs: {
      columns: colRefs,
      segment: isSegmentPlugin ? segRef : undefined,
      outcome: outcomeRef,
    },
    sourceQuestionIds: [block.id],
    dependsOn: [],
    proposedBy: 'system',
    reason: buildReason(pluginId, block, rules),
    status: 'proposed',
  }
}

function wireDependencies(tasks: AnalysisTask[]): void {
  // PostHoc depends on Significance for the same question
  for (const task of tasks) {
    if (task.pluginId === 'posthoc') {
      const sigTask = tasks.find(
        (t) =>
          t.pluginId === 'kw_significance' &&
          t.sourceQuestionIds.length === task.sourceQuestionIds.length &&
          t.sourceQuestionIds.every((id) => task.sourceQuestionIds.includes(id))
      )
      if (sigTask) task.dependsOn.push(sigTask.id)
    }

    // Driver depends on frequency tasks for its source questions
    if (task.pluginId === 'driver_analysis' || task.pluginId === 'regression') {
      const freqTasks = tasks.filter(
        (t) =>
          t.pluginId === 'frequency' &&
          t.sourceQuestionIds.some((id) => task.sourceQuestionIds.includes(id))
      )
      for (const ft of freqTasks) task.dependsOn.push(ft.id)
    }
  }

  // Inject posthoc tasks after their significance dependency
  for (const task of tasks) {
    if (task.pluginId !== 'kw_significance') continue

    // Check if posthoc already exists for this question
    const hasPosthoc = tasks.some(
      (t) =>
        t.pluginId === 'posthoc' &&
        t.sourceQuestionIds.every((id) => task.sourceQuestionIds.includes(id))
    )

    if (!hasPosthoc && pluginExists('posthoc')) {
      const segRef = task.inputs.segment
      if (segRef) {
        tasks.push({
          id: `task_posthoc_${tasks.length + 1}`,
          pluginId: 'posthoc',
          label: task.label.replace('Significance', 'Post-hoc'),
          inputs: { columns: task.inputs.columns, segment: segRef },
          sourceQuestionIds: [...task.sourceQuestionIds],
          dependsOn: [task.id],
          proposedBy: 'system',
          reason: 'Significant group differences → pairwise comparisons with Bonferroni correction',
          status: 'proposed',
        })
      }
    }
  }
}

function pluginLabel(pluginId: string): string {
  const labels: Record<string, string> = {
    frequency: 'Frequency',
    crosstab: 'Crosstab',
    kw_significance: 'Significance',
    posthoc: 'Post-hoc',
    cronbach: 'Reliability',
    efa: 'Factor Analysis',
    regression: 'Regression',
    driver_analysis: 'Driver Analysis',
    correlation: 'Correlation',
    point_biserial: 'Point-Biserial',
    segment_profile: 'Segment Profiles',
  }
  return labels[pluginId] ?? pluginId
}

function buildReason(pluginId: string, block: QuestionBlock, rules?: QuestionRules): string {
  const type = block.questionType
  const n = block.columns.length

  if (rules?.always.includes(pluginId)) return `${type} question → ${pluginLabel(pluginId)}`
  if (rules?.withSegment.includes(pluginId)) return `${type} question with segment → ${pluginLabel(pluginId)}`
  if (rules?.withMultipleItems?.includes(pluginId)) return `${type} with ${n} items → ${pluginLabel(pluginId)}`
  if (rules?.withManyItems?.includes(pluginId)) return `${type} with ${n} items (5+) → ${pluginLabel(pluginId)}`

  return `${pluginLabel(pluginId)} for ${type} question`
}
