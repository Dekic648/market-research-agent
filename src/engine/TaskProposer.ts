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

import type { QuestionBlock, AnalysisTask, ColumnRef, QuestionFormat, ColumnRole } from '../types/dataTypes'
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
  const questions = blocks.filter((b) => b.role === 'analyze')
  const behavioralBlocks = blocks.filter((b) => b.role === 'metric')
  const segmentBlocks = blocks.filter((b) => b.role === 'segment')
  const segmentBlock = segmentBlocks[0] ?? null

  // Build allAnalyzable: question blocks + metric columns from behavioral blocks.
  // Behavioral blocks use behavioralRole to determine which columns are analyzable.
  // Segment blocks are excluded from allAnalyzable — they provide only split variables.
  const metricsFromBehavioral: QuestionBlock[] = []
  for (const beh of behavioralBlocks) {
    const metricCols = beh.columns.filter((c) => {
      // Use explicit behavioralRole if set, otherwise infer from type
      const role = c.role ?? ((c.format === 'behavioral' || c.format === 'rating') ? 'metric' : 'dimension')
      return role === 'metric'
    })
    for (const col of metricCols) {
      metricsFromBehavioral.push({
        id: beh.id,
        label: col.name,
        format: col.format === 'rating' ? 'rating' : 'behavioral',
        columns: [col],
        role: 'analyze' as ColumnRole,
        confirmed: beh.confirmed,
        pastedAt: beh.pastedAt,
      })
    }
  }

  const allAnalyzable = [...questions, ...metricsFromBehavioral]

  // Collect dimension columns from behavioral blocks to use as split variables
  const dimensionsFromBehavioral = behavioralBlocks.flatMap((beh) =>
    beh.columns.filter((c) => {
      const role = c.role ?? ((c.format === 'behavioral' || c.format === 'rating') ? 'metric' : 'dimension')
      return role === 'dimension'
    })
  )

  // Determine segment: explicit segment blocks first, then dimension columns from behavioral blocks
  const hasSegment = segmentBlock !== null || dimensionsFromBehavioral.length > 0

  const tasks: AnalysisTask[] = []
  let taskCounter = 0

  function nextId(pluginId: string): string {
    return `task_${pluginId}_${++taskCounter}`
  }

  // Find the split variable: first categorical from segment block, or first dimension from behavioral
  const segSplitCol = segmentBlock
    ? segmentBlock.columns.find((c) => c.format === 'category' || c.format === 'radio')
      ?? segmentBlock.columns[0]
    : dimensionsFromBehavioral[0] ?? null
  // The block ID that owns the split column
  const segSplitBlockId = segmentBlock?.id ?? (dimensionsFromBehavioral.length > 0
    ? behavioralBlocks.find((b) => b.columns.some((c) => c.id === segSplitCol?.id))?.id
    : undefined)

  // ---- Pass 1: Within-question tasks ----
  // Run Pass 1 on both question blocks AND metric columns from behavioral blocks.
  // Behavioral metrics get 'descriptives' proposed via WITHIN_QUESTION_RULES.behavioral.always.
  for (const block of [...questions, ...metricsFromBehavioral]) {
    const colRefs = block.columns.map((c) => ref(block.id, c.id))
    const segRef = (segSplitCol && segSplitBlockId)
      ? ref(segSplitBlockId, segSplitCol.id)
      : undefined
    const nItems = block.columns.length
    const plan = WITHIN_QUESTION_RULES[block.format]

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

  // Descriptives summary: all ordinal columns across all blocks (Table 1 view)
  const ordinalColumns = allAnalyzable.flatMap((b) =>
    b.columns.filter((c) => c.format === 'rating' || c.format === 'matrix')
  )
  if (ordinalColumns.length >= 2 && pluginExists('descriptives_summary')) {
    const allRefs: ColumnRef[] = []
    const sourceIds: string[] = []
    for (const block of allAnalyzable) {
      for (const col of block.columns) {
        if (col.format === 'rating' || col.format === 'matrix') {
          allRefs.push(ref(block.id, col.id))
          if (!sourceIds.includes(block.id)) sourceIds.push(block.id)
        }
      }
    }
    tasks.push({
      id: nextId('descriptives_summary'),
      pluginId: 'descriptives_summary',
      label: `Summary: ${ordinalColumns.length} survey questions compared`,
      inputs: { columns: allRefs },
      sourceQuestionIds: sourceIds,
      dependsOn: [],
      proposedBy: 'system',
      reason: `${ordinalColumns.length} ordinal columns → summary comparison table with Top Box ranking`,
      status: 'proposed',
    })
  }

  // Driver analysis: single-item rating (outcome) + multi-item scales (predictors)
  // allAnalyzable includes behavioral columns extracted from segment blocks
  const singleRatings = allAnalyzable.filter(
    (b) => (b.format === 'rating' || b.format === 'behavioral') && b.columns.length === 1
  )
  const multiItemScales = allAnalyzable.filter(
    (b) => (b.format === 'rating' || b.format === 'matrix' || b.format === 'behavioral') && b.columns.length >= 2
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
  const correlableBlocks = allAnalyzable.filter(
    (b) => (b.format === 'rating' || b.format === 'matrix' || b.format === 'behavioral')
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
  const binaryBlocks = allAnalyzable.filter(
    (b) => b.format === 'checkbox' && b.columns.length >= 1
  )
  const continuousBlocks = allAnalyzable.filter(
    (b) => (b.format === 'rating' || b.format === 'matrix' || b.format === 'behavioral')
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

  // Logistic regression: binary outcome + continuous predictors
  if (binaryBlocks.length > 0 && continuousBlocks.length > 0 && pluginExists('logistic_regression')) {
    for (const binaryBlock of binaryBlocks) {
      if (binaryBlock.columns[0]?.nRows < 50) continue
      const predictorRefs: ColumnRef[] = []
      const sourceIds: string[] = [binaryBlock.id]
      for (const cb of continuousBlocks) {
        for (const col of cb.columns) {
          predictorRefs.push(ref(cb.id, col.id))
        }
        if (!sourceIds.includes(cb.id)) sourceIds.push(cb.id)
      }
      if (predictorRefs.length >= 1) {
        const outcomeRef = ref(binaryBlock.id, binaryBlock.columns[0].id)
        tasks.push({
          id: nextId('logistic_regression'),
          pluginId: 'logistic_regression',
          label: `Logistic: What predicts ${binaryBlock.label}?`,
          inputs: { columns: predictorRefs, outcome: outcomeRef },
          sourceQuestionIds: sourceIds,
          dependsOn: [],
          proposedBy: 'system',
          reason: `Binary outcome "${binaryBlock.label}" with ${predictorRefs.length} continuous predictor(s) → logistic regression`,
          status: 'proposed',
        })
      }
    }
  }

  // Temporal × continuous: trend over time and time segment comparison
  const temporalBlocks = allAnalyzable.filter((b) => b.format === 'timestamped' && b.columns.length >= 1)
  const numericBlocks = allAnalyzable.filter(
    (b) => (b.format === 'rating' || b.format === 'matrix' || b.format === 'behavioral')
      && b.columns.length >= 1
  )
  if (temporalBlocks.length > 0 && numericBlocks.length > 0) {
    for (const tsBlock of temporalBlocks) {
      for (const numBlock of numericBlocks) {
        const tsRef = ref(tsBlock.id, tsBlock.columns[0].id)
        // For each numeric column, propose trend + time segment comparison
        for (const numCol of numBlock.columns) {
          const numRef = ref(numBlock.id, numCol.id)

          if (pluginExists('trend_over_time')) {
            tasks.push({
              id: nextId('trend_over_time'),
              pluginId: 'trend_over_time',
              label: `Trend: ${numCol.name} over time`,
              inputs: { columns: [tsRef, numRef] },
              sourceQuestionIds: [tsBlock.id, numBlock.id],
              dependsOn: [],
              proposedBy: 'system',
              reason: `Timestamp column "${tsBlock.label}" paired with numeric "${numCol.name}" → trend analysis`,
              status: 'proposed',
            })
          }

          if (pluginExists('time_segment_comparison')) {
            tasks.push({
              id: nextId('time_segment_comparison'),
              pluginId: 'time_segment_comparison',
              label: `Time comparison: ${numCol.name} by period`,
              inputs: { columns: [tsRef, numRef] },
              sourceQuestionIds: [tsBlock.id, numBlock.id],
              dependsOn: [],
              proposedBy: 'system',
              reason: `Timestamp column "${tsBlock.label}" paired with numeric "${numCol.name}" → period comparison`,
              status: 'proposed',
            })
          }
        }
      }
    }
  }

  // Mediation: 3 continuous columns where one is a plausible outcome
  const outcomeKeywords = ['satisfaction', 'nps', 'rating', 'score', 'overall', 'loyalty', 'intent']
  const continuousForMediation = allAnalyzable.filter(
    (b) => (b.format === 'rating' || b.format === 'behavioral' || b.format === 'matrix')
      && b.columns.length === 1
  )
  if (continuousForMediation.length >= 3 && pluginExists('mediation')) {
    const outcomeCandidates = continuousForMediation.filter((b) =>
      outcomeKeywords.some((kw) => b.label.toLowerCase().includes(kw))
    )
    const outcomeBlock = outcomeCandidates[0] ?? continuousForMediation[continuousForMediation.length - 1]
    const others = continuousForMediation.filter((b) => b.id !== outcomeBlock.id)
    if (others.length >= 2) {
      tasks.push({
        id: nextId('mediation'),
        pluginId: 'mediation',
        label: `Mediation: ${others[0].label} → ${others[1].label} → ${outcomeBlock.label}`,
        inputs: {
          columns: [
            ref(others[0].id, others[0].columns[0].id),
            ref(others[1].id, others[1].columns[0].id),
            ref(outcomeBlock.id, outcomeBlock.columns[0].id),
          ],
        },
        sourceQuestionIds: [others[0].id, others[1].id, outcomeBlock.id],
        dependsOn: [],
        proposedBy: 'system',
        reason: `Three continuous variables with "${outcomeBlock.label}" as plausible outcome → mediation analysis`,
        status: 'proposed',
      })
    }
  }

  // Survey × Behavioral bridge
  const surveyBridgeBlocks = allAnalyzable.filter((b) =>
    ['rating', 'matrix', 'checkbox'].includes(b.format) && b.confirmed
  )
  const behavioralBridgeBlocks = allAnalyzable.filter((b) =>
    b.format === 'behavioral' && b.confirmed
  )

  if (surveyBridgeBlocks.length > 0 && behavioralBridgeBlocks.length > 0) {
    let bridgeCount = 0
    const BRIDGE_CAP = 10
    const BRIDGE_OUTCOME_KW = ['revenue', 'spend', 'purchase', 'gross', 'ltv', 'value',
      'nps', 'score', 'rating', 'satisfaction', 'retention', 'churn']

    // Rule 1: correlation for behavioral × rating pairs (max 3 each side)
    const topBehavioral = behavioralBridgeBlocks.slice(0, 3)
    const topSurvey = surveyBridgeBlocks
      .filter((b) => b.format === 'rating' || b.format === 'matrix')
      .slice(0, 3)

    if (pluginExists('correlation')) {
      for (const bBlock of topBehavioral) {
        for (const sBlock of topSurvey) {
          if (bridgeCount >= BRIDGE_CAP) break
          tasks.push({
            id: nextId('correlation'),
            pluginId: 'correlation',
            label: `Bridge: ${bBlock.columns[0].name} × ${sBlock.columns[0].name}`,
            inputs: {
              columns: [ref(bBlock.id, bBlock.columns[0].id), ref(sBlock.id, sBlock.columns[0].id)],
            },
            sourceQuestionIds: [bBlock.id, sBlock.id],
            dependsOn: [],
            proposedBy: 'system',
            reason: `Survey × behavioral bridge: correlate survey rating with behavioral metric`,
            source: 'cross_type_bridge',
            status: 'proposed',
          })
          bridgeCount++
        }
      }
    }

    // Rule 2: driver analysis — survey ratings predict behavioral outcome
    if (pluginExists('driver_analysis') && bridgeCount < BRIDGE_CAP) {
      const bridgeOutcome = behavioralBridgeBlocks.find((b) =>
        BRIDGE_OUTCOME_KW.some((kw) => b.columns[0].name.toLowerCase().includes(kw))
      )
      const ratingPredictors = surveyBridgeBlocks
        .filter((b) => b.format === 'rating' || b.format === 'matrix')
        .flatMap((b) => b.columns)
        .slice(0, 8)

      if (bridgeOutcome && ratingPredictors.length >= 2) {
        const predRefs = ratingPredictors.map((c) => {
          const block = surveyBridgeBlocks.find((b) => b.columns.some((bc) => bc.id === c.id))
          return ref(block!.id, c.id)
        })
        tasks.push({
          id: nextId('driver_analysis'),
          pluginId: 'driver_analysis',
          label: `Bridge: What drives ${bridgeOutcome.columns[0].name}?`,
          inputs: {
            columns: predRefs,
            outcome: ref(bridgeOutcome.id, bridgeOutcome.columns[0].id),
          },
          sourceQuestionIds: [bridgeOutcome.id, ...surveyBridgeBlocks.map((b) => b.id)],
          dependsOn: [],
          proposedBy: 'system',
          reason: `Survey ratings as predictors of behavioral outcome "${bridgeOutcome.columns[0].name}" → driver analysis`,
          source: 'cross_type_bridge',
          status: 'proposed',
        })
        bridgeCount++
      }
    }
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
  const rules = WITHIN_QUESTION_RULES[block.format]
  if (rules?.never.includes(pluginId)) {
    return {
      applicable: false,
      reason: `Not applicable to ${block.format} questions`,
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

const WITHIN_QUESTION_RULES: Partial<Record<QuestionFormat, QuestionRules>> = {
  rating: {
    always: ['frequency'],
    withSegment: ['crosstab', 'kw_significance', 'segment_profile'],
    withMultipleItems: ['cronbach', 'correlation'],
    withManyItems: ['efa'],
    never: ['power_analysis'],
  },
  matrix: {
    always: ['frequency'],
    withSegment: ['crosstab', 'kw_significance', 'segment_profile'],
    withMultipleItems: ['cronbach', 'correlation'],
    withManyItems: ['efa'],
    never: ['power_analysis'],
  },
  checkbox: {
    always: ['frequency'],
    withSegment: ['crosstab'],
    withMultipleItems: [],
    never: ['cronbach', 'correlation', 'regression', 'driver_analysis', 'efa', 'power_analysis'],
  },
  radio: {
    always: ['frequency'],
    withSegment: ['crosstab', 'kw_significance'],
    withMultipleItems: [],
    never: ['cronbach', 'correlation', 'regression', 'driver_analysis', 'efa', 'power_analysis'],
  },
  category: {
    always: ['frequency'],
    withSegment: ['crosstab'],
    withMultipleItems: [],
    never: ['cronbach', 'correlation', 'regression', 'driver_analysis', 'efa', 'power_analysis'],
  },
  behavioral: {
    always: ['descriptives'],
    withSegment: [],
    withMultipleItems: ['correlation'],
    never: ['frequency', 'crosstab', 'kw_significance',
            'cronbach', 'efa', 'segment_profile', 'posthoc', 'power_analysis'],
  },
  verbatim: {
    always: [],
    withSegment: [],
    withMultipleItems: [],
    never: ['frequency', 'cronbach', 'correlation', 'regression', 'driver_analysis',
            'efa', 'crosstab', 'kw_significance', 'posthoc', 'segment_profile', 'point_biserial', 'power_analysis'],
  },
  timestamped: {
    always: ['period_frequency'],
    withSegment: [],
    withMultipleItems: [],
    never: ['frequency', 'cronbach', 'efa', 'power_analysis'],
  },
  multi_assigned: {
    always: ['frequency'],
    withSegment: ['crosstab'],
    withMultipleItems: [],
    never: ['cronbach', 'correlation', 'regression', 'driver_analysis', 'efa', 'power_analysis'],
  },
  multi_response: {
    always: ['frequency'],
    withSegment: ['crosstab'],
    withMultipleItems: [],
    never: ['kw_significance', 'regression', 'driver_analysis', 'correlation', 'cronbach',
            'efa', 'ordinal_regression', 'mediation', 'moderation_analysis', 'point_biserial', 'power_analysis'],
  },
  weight: {
    always: [],
    withSegment: [],
    withMultipleItems: [],
    never: ['frequency', 'cronbach', 'correlation', 'regression', 'driver_analysis',
            'efa', 'crosstab', 'kw_significance', 'posthoc', 'segment_profile', 'point_biserial', 'power_analysis'],
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
  const rules = WITHIN_QUESTION_RULES[block.format]
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
  const type = block.format
  const n = block.columns.length

  if (rules?.always.includes(pluginId)) return `${type} question → ${pluginLabel(pluginId)}`
  if (rules?.withSegment.includes(pluginId)) return `${type} question with segment → ${pluginLabel(pluginId)}`
  if (rules?.withMultipleItems?.includes(pluginId)) return `${type} with ${n} items → ${pluginLabel(pluginId)}`
  if (rules?.withManyItems?.includes(pluginId)) return `${type} with ${n} items (5+) → ${pluginLabel(pluginId)}`

  return `${pluginLabel(pluginId)} for ${type} question`
}
