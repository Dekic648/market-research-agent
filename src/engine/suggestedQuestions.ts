/**
 * Suggested questions — generates business-language analysis prompts
 * from the dataset structure. Used in the Explorer panel.
 */

import type { QuestionBlock, ColumnDefinition } from '../types/dataTypes'

export interface SuggestedQuestion {
  question: string
  analysisDescription: string
  pluginId: string
  columnIds: string[]
  segmentColumnId?: string
}

const OUTCOME_KEYWORDS = [
  'revenue', 'spend', 'purchase', 'gross', 'ltv', 'value',
  'nps', 'score', 'rating', 'satisfaction', 'retention', 'churn',
]

function isOutcomeColumn(col: ColumnDefinition): boolean {
  const name = col.name.toLowerCase()
  return OUTCOME_KEYWORDS.some((kw) => name.includes(kw))
}

function columnVariance(col: ColumnDefinition): number {
  const nums = col.rawValues.filter((v): v is number => typeof v === 'number')
  if (nums.length < 2) return 0
  const mean = nums.reduce((s, v) => s + v, 0) / nums.length
  return nums.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (nums.length - 1)
}

/**
 * Generate suggested analysis questions from the dataset structure.
 * Returns up to 6 questions.
 */
export function generateSuggestedQuestions(
  blocks: QuestionBlock[]
): SuggestedQuestion[] {
  const questions: SuggestedQuestion[] = []
  const MAX_QUESTIONS = 6

  const confirmedBlocks = blocks.filter((b) => b.confirmed && b.columns.length > 0)

  // Collect columns by type
  const behavioralCols: ColumnDefinition[] = []
  const categoryCols: ColumnDefinition[] = []
  const ratingCols: ColumnDefinition[] = []
  const timestampCols: ColumnDefinition[] = []

  for (const block of confirmedBlocks) {
    if (block.role !== 'analyze') continue
    for (const col of block.columns) {
      if (col.format === 'behavioral') behavioralCols.push(col)
      else if (col.format === 'category' || col.format === 'radio') categoryCols.push(col)
      else if (col.format === 'rating' || col.format === 'matrix') ratingCols.push(col)
      else if (col.format === 'timestamped') timestampCols.push(col)
    }
  }

  const allNumeric = [...behavioralCols, ...ratingCols].sort((a, b) => columnVariance(b) - columnVariance(a))

  // Rule 1 — Group comparison (behavioral × category)
  if (behavioralCols.length > 0 && categoryCols.length > 0) {
    const topBehavioral = [...behavioralCols].sort((a, b) => columnVariance(b) - columnVariance(a))
    let count = 0
    for (const bCol of topBehavioral) {
      if (count >= 3 || questions.length >= MAX_QUESTIONS) break
      const catCol = categoryCols[0]
      questions.push({
        question: `Do different ${catCol.name} groups have different ${bCol.name}?`,
        analysisDescription: `Compares ${bCol.name} across ${catCol.name} groups`,
        pluginId: 'kw_significance',
        columnIds: [bCol.id],
        segmentColumnId: catCol.id,
      })
      count++
    }
  }

  // Rule 2 — Correlation (behavioral × behavioral)
  if (allNumeric.length >= 2 && questions.length < MAX_QUESTIONS) {
    const outcomeCols = allNumeric.filter(isOutcomeColumn)
    const outcomeCol = outcomeCols[0] ?? allNumeric[allNumeric.length - 1]
    const otherCol = allNumeric.find((c) => c.id !== outcomeCol.id)
    if (otherCol) {
      questions.push({
        question: `Does ${otherCol.name} relate to ${outcomeCol.name}?`,
        analysisDescription: `Correlation between ${otherCol.name} and ${outcomeCol.name}`,
        pluginId: 'correlation',
        columnIds: [otherCol.id, outcomeCol.id],
      })
    }
    // Second correlation if enough columns
    if (allNumeric.length >= 4 && questions.length < MAX_QUESTIONS) {
      const third = allNumeric.find((c) => c.id !== outcomeCol.id && c.id !== otherCol?.id)
      if (third) {
        questions.push({
          question: `Does ${third.name} relate to ${outcomeCol.name}?`,
          analysisDescription: `Correlation between ${third.name} and ${outcomeCol.name}`,
          pluginId: 'correlation',
          columnIds: [third.id, outcomeCol.id],
        })
      }
    }
  }

  // Rule 3 — Driver analysis
  if (allNumeric.length >= 3 && questions.length < MAX_QUESTIONS) {
    const outcomeCandidates = allNumeric.filter(isOutcomeColumn)
    const outcomeCol = outcomeCandidates[0]
    if (outcomeCol) {
      const predictors = allNumeric.filter((c) => c.id !== outcomeCol.id).slice(0, 8)
      questions.push({
        question: `What drives ${outcomeCol.name}?`,
        analysisDescription: `Tests which metrics most strongly predict ${outcomeCol.name}`,
        pluginId: 'driver_analysis',
        columnIds: [outcomeCol.id, ...predictors.map((c) => c.id)],
      })
    }
  }

  // Rule 4 — Survey × behavioral bridge
  if (ratingCols.length > 0 && behavioralCols.length > 0 && questions.length < MAX_QUESTIONS) {
    const topRating = [...ratingCols].sort((a, b) => columnVariance(b) - columnVariance(a))[0]
    const topBehavioral = [...behavioralCols].sort((a, b) => columnVariance(b) - columnVariance(a))[0]
    questions.push({
      question: 'Do survey ratings relate to actual behavior?',
      analysisDescription: `Correlates ${topRating.name} with ${topBehavioral.name}`,
      pluginId: 'correlation',
      columnIds: [topRating.id, topBehavioral.id],
    })
  }

  // Rule 5 — Trend
  if (timestampCols.length > 0 && behavioralCols.length > 0 && questions.length < MAX_QUESTIONS) {
    const topBehavioral = [...behavioralCols].sort((a, b) => columnVariance(b) - columnVariance(a))[0]
    const tsCcol = timestampCols[0]
    questions.push({
      question: `How has ${topBehavioral.name} changed over time?`,
      analysisDescription: `Shows ${topBehavioral.name} trend by time period`,
      pluginId: 'trend_over_time',
      columnIds: [tsCcol.id, topBehavioral.id],
    })
  }

  return questions.slice(0, MAX_QUESTIONS)
}
