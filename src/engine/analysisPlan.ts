/**
 * buildAnalysisPlan() — five-tier waterfall analysis plan.
 *
 * Pure function. No store imports, no React, no side effects.
 * Takes all blocks and returns a complete tiered plan with tasks.
 *
 * Tiers:
 *   1. Distributions — always eligible
 *   2. Group Comparisons — requires segment/dimension
 *   3. Relationships — requires 2+ analyzable columns
 *   4. Prediction — requires auto-detectable outcome
 *   5. Advanced — always eligible, requires confirmation
 */

import type {
  QuestionBlock, AnalysisTask, AnalysisTier, AnalysisPlan,
  ColumnRef, ColumnDefinition,
} from '../types/dataTypes'
import { AnalysisRegistry } from '../plugins/AnalysisRegistry'
import { isOrdinalFormat } from './formatPredicates'

// ============================================================
// Helpers
// ============================================================

let taskCounter = 0
function nextId(pluginId: string): string {
  return `plan_${pluginId}_${++taskCounter}`
}

function ref(blockId: string, colId: string): ColumnRef {
  return { questionBlockId: blockId, columnId: colId }
}

function pluginExists(id: string): boolean {
  return AnalysisRegistry.get(id) !== undefined
}

export const OUTCOME_KEYWORDS = [
  'satisfaction', 'overall', 'recommend', 'nps', 'rating', 'score',
  'revenue', 'spend', 'ltv', 'arpu', 'purchase', 'gross', 'payment',
]

function isSurveyFormat(col: ColumnDefinition): boolean {
  return col.format === 'rating' || col.format === 'matrix'
    || col.format === 'multi_response' || col.format === 'checkbox'
    || col.format === 'radio'
}

function isBehavioralMetric(col: ColumnDefinition): boolean {
  return col.format === 'behavioral' && (col.role === 'metric' || col.role === 'analyze')
}

function isSegmentCol(col: ColumnDefinition): boolean {
  return col.role === 'segment' || col.role === 'dimension'
}

function isBinaryCol(col: ColumnDefinition): boolean {
  return col.statisticalType === 'binary' || col.format === 'checkbox'
}

interface ColumnWithBlock {
  col: ColumnDefinition
  blockId: string
  blockLabel: string
}

function getAnalyzableColumns(blocks: QuestionBlock[]): ColumnWithBlock[] {
  const result: ColumnWithBlock[] = []
  for (const block of blocks) {
    if (block.role === 'weight') continue
    for (const col of block.columns) {
      if (col.role === 'analyze' || col.role === 'metric') {
        result.push({ col, blockId: block.id, blockLabel: block.label })
      }
    }
  }
  return result
}

function getSegmentColumns(blocks: QuestionBlock[]): ColumnWithBlock[] {
  const result: ColumnWithBlock[] = []
  for (const block of blocks) {
    for (const col of block.columns) {
      if (isSegmentCol(col)) {
        result.push({ col, blockId: block.id, blockLabel: block.label })
      }
    }
  }
  return result
}

// ============================================================
// Tier builders
// ============================================================

function buildTier1(blocks: QuestionBlock[], analyzable: ColumnWithBlock[]): AnalysisTier {
  const tasks: AnalysisTask[] = []

  // Survey ordinal columns → frequency (grouped by block for matrix questions)
  const freqByBlock = new Map<string, ColumnWithBlock[]>()
  for (const cwb of analyzable) {
    if (isSurveyFormat(cwb.col) && pluginExists('frequency')) {
      if (!freqByBlock.has(cwb.blockId)) freqByBlock.set(cwb.blockId, [])
      freqByBlock.get(cwb.blockId)!.push(cwb)
    }
  }

  for (const [blockId, cols] of freqByBlock) {
    const colRefs = cols.map(({ col }) => ref(blockId, col.id))
    tasks.push({
      id: nextId('frequency'),
      pluginId: 'frequency',
      label: cols.length === 1 ? `Frequency: ${cols[0].col.name}` : `Frequency: ${cols[0].blockLabel}`,
      inputs: { columns: colRefs },
      sourceQuestionIds: [blockId],
      dependsOn: [],
      proposedBy: 'system',
      reason: cols.length === 1
        ? `Survey question → frequency distribution`
        : `${cols.length} items in matrix → grouped frequency distribution`,
      status: 'proposed',
    })
  }

  // Behavioral metric columns → descriptives
  for (const { col, blockId } of analyzable) {
    if (isBehavioralMetric(col) && pluginExists('descriptives')) {
      tasks.push({
        id: nextId('descriptives'),
        pluginId: 'descriptives',
        label: `Descriptives: ${col.name}`,
        inputs: { columns: [ref(blockId, col.id)] },
        sourceQuestionIds: [blockId],
        dependsOn: [],
        proposedBy: 'system',
        reason: `Behavioral metric → descriptive statistics with histogram`,
        status: 'proposed',
      })
    }
  }

  // Descriptives summary: 2+ ordinal columns (rating/matrix/radio-ordinal only — not checkbox/multi_response)
  const ordinalCols = analyzable.filter(({ col }) => isOrdinalFormat(col))
  if (ordinalCols.length >= 2 && pluginExists('descriptives_summary')) {
    const allRefs = ordinalCols.map(({ col, blockId }) => ref(blockId, col.id))
    const sourceIds = [...new Set(ordinalCols.map(({ blockId }) => blockId))]
    tasks.push({
      id: nextId('descriptives_summary'),
      pluginId: 'descriptives_summary',
      label: `Summary: ${ordinalCols.length} survey questions compared`,
      inputs: { columns: allRefs },
      sourceQuestionIds: sourceIds,
      dependsOn: [],
      proposedBy: 'system',
      reason: `${ordinalCols.length} ordinal columns → summary comparison table`,
      status: 'proposed',
    })
  }

  return {
    id: 1,
    label: 'How do people respond?',
    description: `${tasks.length} distribution analyses`,
    plugins: [...new Set(tasks.map((t) => t.pluginId))],
    eligible: true,
    tasks,
  }
}

function buildTier2(
  analyzable: ColumnWithBlock[],
  segments: ColumnWithBlock[]
): AnalysisTier {
  if (segments.length === 0) {
    return {
      id: 2,
      label: 'How do segments differ?',
      description: 'Compare across groups',
      plugins: [],
      eligible: false,
      reason: 'Add a segment column to compare groups.',
      tasks: [],
    }
  }

  const tasks: AnalysisTask[] = []
  const MAX_TASKS = 20

  // Helper to add a group comparison task set for a single column
  function addGroupTasks(
    col: ColumnWithBlock,
    seg: ColumnWithBlock,
    crossType: boolean,
    label: string
  ) {
    if (tasks.length >= MAX_TASKS) return
    const colRef = ref(col.blockId, col.col.id)
    const segRef = ref(seg.blockId, seg.col.id)

    // KW significance
    if (pluginExists('kw_significance')) {
      tasks.push({
        id: nextId('kw_significance'),
        pluginId: 'kw_significance',
        label,
        inputs: { columns: [colRef], segment: segRef },
        sourceQuestionIds: [col.blockId, seg.blockId],
        dependsOn: [],
        proposedBy: 'system',
        reason: `Group comparison: ${col.col.name} by ${seg.col.name}`,
        crossType,
        status: 'proposed',
      })
    }

    // ANOVA for continuous columns
    if (isBehavioralMetric(col.col) && pluginExists('anova_oneway') && tasks.length < MAX_TASKS) {
      tasks.push({
        id: nextId('anova_oneway'),
        pluginId: 'anova_oneway',
        label: `ANOVA: ${col.col.name} by ${seg.col.name}`,
        inputs: { columns: [colRef], segment: segRef },
        sourceQuestionIds: [col.blockId, seg.blockId],
        dependsOn: [],
        proposedBy: 'system',
        reason: `Continuous metric → ANOVA (KW as fallback)`,
        crossType,
        status: 'proposed',
      })
    }
  }

  // Helper to add crosstab + segment profile for ALL columns in a block at once
  function addCrosstabBlock(
    cols: ColumnWithBlock[],
    seg: ColumnWithBlock,
    crossType: boolean
  ) {
    if (tasks.length >= MAX_TASKS || cols.length === 0) return
    const segRef = ref(seg.blockId, seg.col.id)
    const colRefs = cols.map(({ col, blockId }) => ref(blockId, col.id))
    const sourceIds = [...new Set([...cols.map(({ blockId }) => blockId), seg.blockId])]
    const blockLabel = cols[0]?.blockLabel ?? cols[0]?.col.name ?? 'Items'

    // Crosstab: % distribution table + grouped bar chart
    if (pluginExists('crosstab')) {
      tasks.push({
        id: nextId('crosstab'),
        pluginId: 'crosstab',
        label: `${blockLabel} by ${seg.col.name}`,
        inputs: { columns: colRefs, segment: segRef },
        sourceQuestionIds: sourceIds,
        dependsOn: [],
        proposedBy: 'system',
        reason: `Cross-tabulation: % distribution by ${seg.col.name}`,
        crossType,
        status: 'proposed',
      })
    }

    // Segment profiles
    if (pluginExists('segment_profile') && tasks.length < MAX_TASKS) {
      tasks.push({
        id: nextId('segment_profile'),
        pluginId: 'segment_profile',
        label: `Segment profiles: ${blockLabel} by ${seg.col.name}`,
        inputs: { columns: colRefs, segment: segRef },
        sourceQuestionIds: sourceIds,
        dependsOn: [],
        proposedBy: 'system',
        reason: `How each ${seg.col.name} segment rates across all items`,
        crossType,
        status: 'proposed',
      })
    }
  }

  // Priority 0: Crosstab tables — one per block × segment (ALL columns in block together)
  // This is the most important visualization: % distribution table + grouped bar chart
  const surveyOrdinals = analyzable.filter(({ col }) => isSurveyFormat(col))
  const surveySegments = segments.filter(({ col }) => !isBehavioralMetric(col))
  const behavioralMetrics = analyzable.filter(({ col }) => isBehavioralMetric(col))
  const behavioralDimensions = segments.filter(({ col }) => col.role === 'dimension')

  // Group survey columns by block for block-level crosstab
  const blockGroups = new Map<string, ColumnWithBlock[]>()
  for (const cwb of surveyOrdinals) {
    if (!blockGroups.has(cwb.blockId)) blockGroups.set(cwb.blockId, [])
    blockGroups.get(cwb.blockId)!.push(cwb)
  }

  for (const seg of surveySegments) {
    for (const [, blockCols] of blockGroups) {
      addCrosstabBlock(blockCols, seg, false)
    }
  }
  for (const dim of behavioralDimensions) {
    for (const [, blockCols] of blockGroups) {
      addCrosstabBlock(blockCols, dim, true)
    }
  }

  // Priority 1: KW significance per column × segment
  for (const seg of surveySegments) {
    for (const col of surveyOrdinals) {
      addGroupTasks(col, seg, false, `${col.col.name} by ${seg.col.name}`)
    }
  }

  // Priority 2: cross-type comparisons
  for (const seg of surveySegments) {
    for (const met of behavioralMetrics) {
      addGroupTasks(met, seg, true, `Do ${seg.col.name} groups differ in ${met.col.name}?`)
    }
  }

  for (const dim of behavioralDimensions) {
    for (const col of surveyOrdinals) {
      addGroupTasks(col, dim, true, `Do ${dim.col.name} tiers rate ${col.col.name} differently?`)
    }
  }

  // Priority 3: behavioral × behavioral
  for (const dim of behavioralDimensions) {
    for (const met of behavioralMetrics) {
      addGroupTasks(met, dim, false, `${met.col.name} across ${dim.col.name} tiers`)
    }
  }

  const hasCrossType = tasks.some((t) => t.crossType)
  return {
    id: 2,
    label: 'How do segments differ?',
    description: `${tasks.length} comparison${tasks.length !== 1 ? 's' : ''} across groups`,
    plugins: [...new Set(tasks.map((t) => t.pluginId))],
    eligible: true,
    crossType: hasCrossType,
    tasks,
  }
}

function buildTier3(analyzable: ColumnWithBlock[], blocks: QuestionBlock[]): AnalysisTier {
  if (analyzable.length < 2) {
    return {
      id: 3,
      label: 'What moves together?',
      description: 'Correlation and reliability',
      plugins: [],
      eligible: false,
      reason: 'Add more questions to enable correlation analysis.',
      tasks: [],
    }
  }

  const tasks: AnalysisTask[] = []

  // Correlation: 2+ ordinal columns (strings from checkbox/multi_response would fail)
  const ordinals = analyzable.filter(({ col }) => isOrdinalFormat(col))
  const behaviorals = analyzable.filter(({ col }) => isBehavioralMetric(col))
  let hasCrossType = false

  // Survey ordinal × survey ordinal
  if (ordinals.length >= 2 && pluginExists('correlation')) {
    const allRefs = ordinals.map(({ col, blockId }) => ref(blockId, col.id))
    tasks.push({
      id: nextId('correlation'),
      pluginId: 'correlation',
      label: `Correlation: ${ordinals.length} survey items`,
      inputs: { columns: allRefs },
      sourceQuestionIds: [...new Set(ordinals.map(({ blockId }) => blockId))],
      dependsOn: [],
      proposedBy: 'system',
      reason: `${ordinals.length} survey ordinal columns → correlation matrix`,
      status: 'proposed',
    })
  }

  // Behavioral × behavioral
  if (behaviorals.length >= 2 && pluginExists('correlation')) {
    const allRefs = behaviorals.map(({ col, blockId }) => ref(blockId, col.id))
    tasks.push({
      id: nextId('correlation'),
      pluginId: 'correlation',
      label: `Correlation: ${behaviorals.length} behavioral metrics (Spearman)`,
      inputs: { columns: allRefs },
      sourceQuestionIds: [...new Set(behaviorals.map(({ blockId }) => blockId))],
      dependsOn: [],
      proposedBy: 'system',
      reason: `${behaviorals.length} behavioral metrics → Spearman correlation`,
      status: 'proposed',
    })
  }

  // Cross-type: survey × behavioral
  if (ordinals.length >= 1 && behaviorals.length >= 1 && pluginExists('correlation')) {
    const crossRefs = [
      ...ordinals.slice(0, 3).map(({ col, blockId }) => ref(blockId, col.id)),
      ...behaviorals.slice(0, 3).map(({ col, blockId }) => ref(blockId, col.id)),
    ]
    tasks.push({
      id: nextId('correlation'),
      pluginId: 'correlation',
      label: `Survey × Behavioral correlation`,
      inputs: { columns: crossRefs },
      sourceQuestionIds: [...new Set([...ordinals.slice(0, 3), ...behaviorals.slice(0, 3)].map(({ blockId }) => blockId))],
      dependsOn: [],
      proposedBy: 'system',
      reason: `Survey ratings × behavioral metrics → cross-type correlation`,
      crossType: true,
      status: 'proposed',
    })
    hasCrossType = true
  }

  // Cronbach alpha: 3+ Likert items from same block (rating/matrix only — not checkbox/radio/multi_response)
  for (const block of blocks) {
    const ordinalInBlock = block.columns.filter((c) => c.format === 'rating' || c.format === 'matrix')
    if (ordinalInBlock.length >= 3 && pluginExists('cronbach')) {
      tasks.push({
        id: nextId('cronbach'),
        pluginId: 'cronbach',
        label: `Reliability: ${block.label}`,
        inputs: { columns: ordinalInBlock.map((c) => ref(block.id, c.id)) },
        sourceQuestionIds: [block.id],
        dependsOn: [],
        proposedBy: 'system',
        reason: `${ordinalInBlock.length} items → Cronbach's alpha`,
        status: 'proposed',
      })
    }

    // EFA: 5+ ordinal from same block
    if (ordinalInBlock.length >= 5 && pluginExists('efa')) {
      tasks.push({
        id: nextId('efa'),
        pluginId: 'efa',
        label: `Factor Analysis: ${block.label}`,
        inputs: { columns: ordinalInBlock.map((c) => ref(block.id, c.id)) },
        sourceQuestionIds: [block.id],
        dependsOn: [],
        proposedBy: 'system',
        reason: `${ordinalInBlock.length} items → exploratory factor analysis`,
        status: 'proposed',
      })
    }
  }

  return {
    id: 3,
    label: 'What moves together?',
    description: `Correlation${tasks.some((t) => t.pluginId === 'cronbach') ? ' + reliability' : ''}`,
    plugins: [...new Set(tasks.map((t) => t.pluginId))],
    eligible: true,
    crossType: hasCrossType,
    tasks,
  }
}

function buildTier4(analyzable: ColumnWithBlock[]): AnalysisTier {
  const tasks: AnalysisTask[] = []

  // Auto-detect outcome
  let detectedOutcome: ColumnWithBlock | null = null

  // Priority 1: name match
  for (const cwb of analyzable) {
    const lower = cwb.col.name.toLowerCase()
    if (OUTCOME_KEYWORDS.some((kw) => lower.includes(kw))) {
      detectedOutcome = cwb
      break
    }
  }

  // Priority 2: single ordinal in block with 3+ other columns
  if (!detectedOutcome) {
    // Find single-column ordinal blocks when multi-column blocks exist
    const singleOrdinals = analyzable.filter(({ col }) => isOrdinalFormat(col))
    if (singleOrdinals.length === 1 && analyzable.length >= 4) {
      detectedOutcome = singleOrdinals[0]
    }
  }

  // Priority 3: single behavioral spend/count column
  if (!detectedOutcome) {
    const spendCols = analyzable.filter(({ col }) =>
      col.statisticalType === 'spend' || col.statisticalType === 'count'
    )
    if (spendCols.length === 1) {
      detectedOutcome = spendCols[0]
    }
  }

  // Priority 4: binary column (logistic regression candidate)
  if (!detectedOutcome) {
    const binaryCols = analyzable.filter(({ col }) => isBinaryCol(col))
    if (binaryCols.length === 1 && analyzable.length >= 2) {
      detectedOutcome = binaryCols[0]
    }
  }

  if (!detectedOutcome) {
    return {
      id: 4,
      label: 'What drives the outcome?',
      description: 'Driver analysis and regression',
      plugins: [],
      eligible: false,
      reason: 'No clear outcome column detected. Use Explorer to run regression manually.',
      tasks: [],
    }
  }

  const outcome = detectedOutcome
  const predictors = analyzable.filter(({ col }) => col.id !== outcome.col.id)
  if (predictors.length === 0) {
    return {
      id: 4, label: 'What drives the outcome?', description: 'Driver analysis', plugins: [],
      eligible: false, reason: 'Only one column — need predictors for regression.',
      tasks: [],
    }
  }

  const outcomeRef = ref(outcome.blockId, outcome.col.id)
  const isBinaryOutcome = isBinaryCol(outcome.col)
  const isBehavioralOutcome = isBehavioralMetric(outcome.col)
  const surveyPredictors = predictors.filter(({ col }) => isOrdinalFormat(col))
  const behavioralPredictors = predictors.filter(({ col }) => isBehavioralMetric(col))

  let hasCrossType = false

  // Binary outcome → logistic regression
  if (isBinaryOutcome && pluginExists('logistic_regression') && predictors.length >= 1) {
    const predRefs = predictors.slice(0, 8).map(({ col, blockId }) => ref(blockId, col.id))
    const crossType = (surveyPredictors.length > 0 && isBehavioralOutcome)
      || (behavioralPredictors.length > 0 && !isBehavioralOutcome)
    tasks.push({
      id: nextId('logistic_regression'),
      pluginId: 'logistic_regression',
      label: `What predicts ${outcome.col.name}?`,
      inputs: { columns: predRefs, outcome: outcomeRef },
      sourceQuestionIds: [...new Set([outcome.blockId, ...predictors.slice(0, 8).map(({ blockId }) => blockId)])],
      dependsOn: [],
      proposedBy: 'system',
      reason: `Binary outcome → logistic regression`,
      crossType,
      status: 'proposed',
    })
    if (crossType) hasCrossType = true
  }

  // Survey outcome ~ survey predictors → driver_analysis
  if (!isBinaryOutcome && surveyPredictors.length >= 2 && pluginExists('driver_analysis')) {
    const predRefs = surveyPredictors.slice(0, 8).map(({ col, blockId }) => ref(blockId, col.id))
    tasks.push({
      id: nextId('driver_analysis'),
      pluginId: 'driver_analysis',
      label: `What drives ${outcome.col.name}?`,
      inputs: { columns: predRefs, outcome: outcomeRef },
      sourceQuestionIds: [...new Set([outcome.blockId, ...surveyPredictors.slice(0, 8).map(({ blockId }) => blockId)])],
      dependsOn: [],
      proposedBy: 'system',
      reason: `Survey outcome with survey predictors → key driver analysis`,
      status: 'proposed',
    })
  }

  // Cross-type: behavioral outcome ~ survey predictors
  if (!isBinaryOutcome && isBehavioralOutcome && surveyPredictors.length >= 1 && pluginExists('regression')) {
    const predRefs = surveyPredictors.slice(0, 8).map(({ col, blockId }) => ref(blockId, col.id))
    tasks.push({
      id: nextId('regression'),
      pluginId: 'regression',
      label: `Which attitudes predict ${outcome.col.name}?`,
      inputs: { columns: predRefs, outcome: outcomeRef },
      sourceQuestionIds: [...new Set([outcome.blockId, ...surveyPredictors.slice(0, 8).map(({ blockId }) => blockId)])],
      dependsOn: [],
      proposedBy: 'system',
      reason: `Behavioral outcome ~ survey predictors → cross-type regression`,
      crossType: true,
      status: 'proposed',
    })
    hasCrossType = true
  }

  // Cross-type: survey outcome ~ behavioral predictors
  if (!isBinaryOutcome && !isBehavioralOutcome && behavioralPredictors.length >= 1 && pluginExists('regression')) {
    const predRefs = behavioralPredictors.slice(0, 8).map(({ col, blockId }) => ref(blockId, col.id))
    tasks.push({
      id: nextId('regression'),
      pluginId: 'regression',
      label: `Do behavioral patterns predict ${outcome.col.name}?`,
      inputs: { columns: predRefs, outcome: outcomeRef },
      sourceQuestionIds: [...new Set([outcome.blockId, ...behavioralPredictors.slice(0, 8).map(({ blockId }) => blockId)])],
      dependsOn: [],
      proposedBy: 'system',
      reason: `Survey outcome ~ behavioral predictors → cross-type regression`,
      crossType: true,
      status: 'proposed',
    })
    hasCrossType = true
  }

  return {
    id: 4,
    label: 'What drives the outcome?',
    description: tasks.map((t) => t.label).join(', '),
    plugins: [...new Set(tasks.map((t) => t.pluginId))],
    eligible: true,
    crossType: hasCrossType,
    tasks,
  }
}

function buildTier5(analyzable: ColumnWithBlock[]): AnalysisTier {
  const tasks: AnalysisTask[] = []

  // Mediation: 3+ continuous
  const continuous = analyzable.filter(({ col }) =>
    col.statisticalType === 'continuous' || col.statisticalType === 'ordinal'
  )
  if (continuous.length >= 3 && pluginExists('mediation')) {
    tasks.push({
      id: nextId('mediation'),
      pluginId: 'mediation',
      label: 'Mediation analysis',
      inputs: { columns: continuous.slice(0, 3).map(({ col, blockId }) => ref(blockId, col.id)) },
      sourceQuestionIds: [...new Set(continuous.slice(0, 3).map(({ blockId }) => blockId))],
      dependsOn: [],
      proposedBy: 'system',
      reason: '3+ continuous columns → mediation analysis available',
      requiresConfirmation: true,
      status: 'proposed',
    })
  }

  // Moderation: always available (manual)
  if (pluginExists('moderation_analysis')) {
    tasks.push({
      id: nextId('moderation_analysis'),
      pluginId: 'moderation_analysis',
      label: 'Moderation analysis',
      inputs: { columns: [] },
      sourceQuestionIds: [],
      dependsOn: [],
      proposedBy: 'system',
      reason: 'Always available — configure in Explorer',
      requiresConfirmation: true,
      status: 'proposed',
    })
  }

  // Power analysis: always available
  if (pluginExists('power_analysis')) {
    tasks.push({
      id: nextId('power_analysis'),
      pluginId: 'power_analysis',
      label: 'Power calculator',
      inputs: { columns: [] },
      sourceQuestionIds: [],
      dependsOn: [],
      proposedBy: 'system',
      reason: 'Always available — sample size estimation',
      requiresConfirmation: true,
      status: 'proposed',
    })
  }

  return {
    id: 5,
    label: 'Advanced analyses',
    description: `${tasks.length} analyses — expand to review`,
    plugins: [...new Set(tasks.map((t) => t.pluginId))],
    eligible: true,
    tasks,
  }
}

// ============================================================
// Public API
// ============================================================

export function buildAnalysisPlan(blocks: QuestionBlock[]): AnalysisPlan {
  taskCounter = 0

  const analyzable = getAnalyzableColumns(blocks)
  const segments = getSegmentColumns(blocks)

  const tier1 = buildTier1(blocks, analyzable)
  const tier2 = buildTier2(analyzable, segments)
  const tier3 = buildTier3(analyzable, blocks)
  const tier4 = buildTier4(analyzable)
  const tier5 = buildTier5(analyzable)

  // Detect outcome for plan metadata
  let detectedOutcome: string | null = null
  if (tier4.eligible && tier4.tasks.length > 0) {
    const outcomeTask = tier4.tasks[0]
    if (outcomeTask.inputs.outcome) {
      for (const block of blocks) {
        const col = block.columns.find((c) => c.id === outcomeTask.inputs.outcome?.columnId)
        if (col) { detectedOutcome = col.name; break }
      }
    }
  }

  return {
    tiers: [tier1, tier2, tier3, tier4, tier5],
    detectedOutcome,
    detectedSegments: segments.map(({ col }) => col.name),
    detectedBehavioral: analyzable.filter(({ col }) => isBehavioralMetric(col)).map(({ col }) => col.name),
    confirmedByUser: false,
    generatedAt: Date.now(),
  }
}

/**
 * Convert an AnalysisPlan into a flat list of AnalysisTasks for the runner.
 * Tier 5 tasks with requiresConfirmation are excluded unless explicitly confirmed.
 */
export function proposeTasksFromPlan(plan: AnalysisPlan): AnalysisTask[] {
  const tasks: AnalysisTask[] = []
  for (const tier of plan.tiers) {
    if (!tier.eligible) continue
    for (const task of tier.tasks) {
      if (task.requiresConfirmation && task.status !== 'confirmed') continue
      tasks.push(task)
    }
  }
  return tasks
}
