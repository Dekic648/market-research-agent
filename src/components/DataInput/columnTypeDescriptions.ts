/**
 * Plain-language type descriptions — display-only translations of internal QuestionType.
 * Internal identifiers are never shown to users.
 */

import type { QuestionType } from '../../types/dataTypes'

export interface TypeDescription {
  label: string           // plain-language name
  consequence: string     // what this classification means for analysis
  helpText: string        // expandable explanation
}

export const TYPE_DESCRIPTIONS: Record<QuestionType, TypeDescription> = {
  rating: {
    label: 'Scale or rating (e.g. 1–5 satisfaction)',
    consequence: "We'll use rank-based tests. Good for comparing groups and measuring agreement.",
    helpText: "Use this when respondents picked a number on a scale — like rating satisfaction from 1 to 5, or agreement from Strongly Disagree to Strongly Agree. The order of numbers matters but we don't assume the gap between 1 and 2 is the same as between 4 and 5.",
  },
  checkbox: {
    label: 'Yes / No or binary choice',
    consequence: "We'll use proportion tests and chi-square. Averages won't be computed.",
    helpText: "Use this when there are exactly two possible answers — yes/no, pass/fail, buyer/non-buyer. We'll analyze proportions, not averages.",
  },
  category: {
    label: 'Categories (e.g. gender, region, brand)',
    consequence: 'Numbers here have no mathematical meaning. We\'ll treat them as labels only.',
    helpText: "Use this when numbers or labels represent groups with no natural order — like country codes, brand names, or gender. Even if stored as 1, 2, 3, the numbers mean nothing mathematically.",
  },
  matrix: {
    label: 'Scale battery (multiple items, same scale)',
    consequence: "We'll test reliability across items and offer factor analysis.",
    helpText: "Use this when multiple questions share the same scale and measure the same underlying thing — like a set of 5 questions all rated 1–5 measuring brand trust.",
  },
  behavioral: {
    label: 'Measured number (e.g. age, revenue, time)',
    consequence: "We'll use parametric tests and regression.",
    helpText: "Use this for real quantities — age, income, time spent, number of purchases. The difference between values is mathematically meaningful.",
  },
  verbatim: {
    label: 'Open text (free-form answers)',
    consequence: 'No statistical tests. Available for theme extraction only.',
    helpText: 'Use this for open-ended responses where respondents typed their own answer. These cannot be analyzed with numbers — only with text analysis tools.',
  },
  weight: {
    label: 'Respondent weight',
    consequence: 'This column will weight all other analyses proportionally.',
    helpText: 'Use this when this column contains survey weights (e.g. from post-stratification). All analyses will apply these weights to adjust for sample bias.',
  },
  radio: {
    label: 'Single choice from a list',
    consequence: "We'll analyze response distributions and compare across groups.",
    helpText: 'Use this when respondents chose one answer from a list — like picking a brand or selecting a preference. Similar to Categories but typically from a survey question.',
  },
  timestamped: {
    label: 'Date or time value',
    consequence: 'Available for temporal analysis. Not used in standard statistical tests.',
    helpText: 'Use this for date, time, or datetime columns. These can be used for trend analysis or duration calculations.',
  },
  multi_assigned: {
    label: 'Multi-coded responses (comma/pipe separated)',
    consequence: "We'll split codes into separate binary indicators for analysis.",
    helpText: 'Use this when a single cell contains multiple codes separated by commas or pipes — like theme codes "1,3,5" or "quality|price". Each code becomes its own yes/no variable.',
  },
}

/** Types available for user selection — excludes internal-only types */
export const SELECTABLE_TYPES: QuestionType[] = [
  'rating',
  'matrix',
  'checkbox',
  'category',
  'behavioral',
  'verbatim',
  'radio',
  'weight',
]
