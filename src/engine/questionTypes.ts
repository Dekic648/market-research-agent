/**
 * questionTypes.ts — Single source of truth for all data types in the app.
 *
 * Every decision about chart, stats, labels, and display must read from here.
 * If a type is not defined here, it does not exist.
 *
 * THERE ARE EXACTLY 7 TYPES:
 *   Survey:     radio, radio_grid, checkbox, checkbox_grid, open_ended
 *   Data:       segment, behavioral
 *
 * RULES:
 * - Zero imports from React, Zustand, DOM
 * - Pure data — no functions, no side effects
 * - When adding a new type, add it here FIRST, then wire it
 * - No other file may define type-specific if/else chains.
 *   All type-branching reads from this contract.
 */

// ============================================================
// The 7 types
// ============================================================

export type SurveyQuestionType =
  | 'radio'           // 1. Radio Button / Likert
  | 'radio_grid'      // 2. Radio Button Grid
  | 'checkbox'        // 3. Checkboxes (multi-select)
  | 'checkbox_grid'   // 4. Checkbox Grid
  | 'open_ended'      // 5. Open-ended text

export type DataColumnType =
  | 'segment'         // 6. Segment / grouping variable
  | 'behavioral'      // 7. Behavioral / metric data

export type ColumnType = SurveyQuestionType | DataColumnType

// ============================================================
// Contract interfaces
// ============================================================

export interface ChartContract {
  /** Primary chart — ALWAYS rendered first. null = no chart. */
  primaryChart: 'horizontalBar' | 'histogram' | null

  /** What the primary chart shows */
  primaryChartRule: string

  /** Additional chart added when segment is present. null = none. */
  segmentChart: 'groupedBar' | null

  /** What the chart Y-axis shows */
  yAxis: 'response_options' | 'value_bins' | 'none'

  /** What the chart X-axis shows */
  xAxis: 'percentage' | 'count' | 'none'
}

export interface StatsContract {
  /** Stats that always run */
  alwaysRun: string[]

  /** Stats that run when a segment column is present */
  withSegment: string[]

  /** Stats that run when 3+ items exist in the block */
  withMultipleItems: string[]

  /** Stats that are NEVER allowed — takes priority over everything */
  forbidden: string[]
}

export interface DisplayContract {
  /** How to compute the denominator for % */
  denominator: 'respondents_who_answered' | 'total_sample' | 'not_applicable'

  /** What empty/null cells mean */
  nullMeaning: 'missing' | 'not_chosen' | 'not_applicable'

  /** Whether this column is analyzed or used as a split/grouping variable */
  role: 'analyze' | 'split' | 'none'
}

export interface TypeContract {
  /** Human-readable name */
  label: string

  /** What this type represents */
  description: string

  /** How data looks when exported (one row per respondent) */
  dataShape: string

  /** How a single value appears in raw data */
  rawValueExample: string

  chart: ChartContract
  stats: StatsContract
  display: DisplayContract
}

// ============================================================
// The 7 contracts
// ============================================================

export const TYPE_CONTRACT: Record<ColumnType, TypeContract> = {

  // ---------------------------------------------------------
  // 1. Radio Button / Likert
  // ---------------------------------------------------------
  radio: {
    label: 'Radio Button / Likert',
    description: 'Respondent selects a single choice from a list.',
    dataShape: '1 column. Each row = one selected option.',
    rawValueExample: '"Agree" or "3" or "1) Strongly Agree"',

    chart: {
      primaryChart: 'horizontalBar',
      primaryChartRule: 'Horizontal bar showing each response option with % of respondents.',
      segmentChart: 'groupedBar',
      yAxis: 'response_options',
      xAxis: 'percentage',
    },

    stats: {
      alwaysRun: ['frequency'],
      withSegment: ['crosstab', 'kw_significance'],
      withMultipleItems: [],
      forbidden: ['cronbach', 'correlation', 'efa', 'regression', 'driver_analysis', 'power_analysis'],
    },

    display: {
      denominator: 'respondents_who_answered',
      nullMeaning: 'missing',
      role: 'analyze',
    },
  },

  // ---------------------------------------------------------
  // 2. Radio Button Grid
  // ---------------------------------------------------------
  radio_grid: {
    label: 'Radio Button Grid',
    description: 'Respondent selects one answer option per row in a grid. All rows share the same scale.',
    dataShape: 'N columns (one per row/item). Each cell = the selected option for that item.',
    rawValueExample: '"4" or "Satisfied" — one value per cell, same scale across columns.',

    chart: {
      primaryChart: 'horizontalBar',
      primaryChartRule: 'One horizontal bar chart per item, each showing response options with %. Items rendered separately, not stacked.',
      segmentChart: 'groupedBar',
      yAxis: 'response_options',
      xAxis: 'percentage',
    },

    stats: {
      alwaysRun: ['frequency'],
      withSegment: ['crosstab', 'kw_significance', 'segment_profile'],
      withMultipleItems: ['cronbach', 'correlation'],
      forbidden: ['power_analysis'],
    },

    display: {
      denominator: 'respondents_who_answered',
      nullMeaning: 'missing',
      role: 'analyze',
    },
  },

  // ---------------------------------------------------------
  // 3. Checkboxes (multi-select)
  // ---------------------------------------------------------
  checkbox: {
    label: 'Checkboxes',
    description: 'Respondent selects multiple answers from a list.',
    dataShape: 'N columns (one per option). Each cell = option label if selected, empty if not.',
    rawValueExample: '"Email" if selected, empty if not selected.',

    chart: {
      primaryChart: 'horizontalBar',
      primaryChartRule: 'Horizontal bar showing each option with % of total respondents who selected it (reach %).',
      segmentChart: 'groupedBar',
      yAxis: 'response_options',
      xAxis: 'percentage',
    },

    stats: {
      alwaysRun: ['frequency'],
      withSegment: ['crosstab'],
      withMultipleItems: [],
      forbidden: ['kw_significance', 'cronbach', 'correlation', 'efa', 'regression', 'driver_analysis', 'mediation', 'moderation_analysis', 'point_biserial', 'power_analysis'],
    },

    display: {
      denominator: 'total_sample',
      nullMeaning: 'not_chosen',
      role: 'analyze',
    },
  },

  // ---------------------------------------------------------
  // 4. Checkbox Grid
  // ---------------------------------------------------------
  checkbox_grid: {
    label: 'Checkbox Grid',
    description: 'Respondent selects multiple answer options for each row in a table.',
    dataShape: 'Rows x Columns matrix. Each cell = option label if selected, empty if not.',
    rawValueExample: '"Phone" if selected for that row, empty if not.',

    chart: {
      primaryChart: 'horizontalBar',
      primaryChartRule: 'One horizontal bar chart per grid row, showing each column option with % who selected it.',
      segmentChart: 'groupedBar',
      yAxis: 'response_options',
      xAxis: 'percentage',
    },

    stats: {
      alwaysRun: ['frequency'],
      withSegment: ['crosstab'],
      withMultipleItems: [],
      forbidden: ['kw_significance', 'cronbach', 'correlation', 'efa', 'regression', 'driver_analysis', 'mediation', 'moderation_analysis', 'point_biserial', 'power_analysis'],
    },

    display: {
      denominator: 'total_sample',
      nullMeaning: 'not_chosen',
      role: 'analyze',
    },
  },

  // ---------------------------------------------------------
  // 5. Open-ended
  // ---------------------------------------------------------
  open_ended: {
    label: 'Open-ended',
    description: 'Respondent types a free-text answer.',
    dataShape: '1 column. Each row = text response.',
    rawValueExample: '"Great service, would recommend"',

    chart: {
      primaryChart: null,
      primaryChartRule: 'No chart. Text data is excluded from statistical analysis.',
      segmentChart: null,
      yAxis: 'none',
      xAxis: 'none',
    },

    stats: {
      alwaysRun: [],
      withSegment: [],
      withMultipleItems: [],
      forbidden: ['frequency', 'crosstab', 'kw_significance', 'cronbach', 'correlation', 'efa', 'regression', 'driver_analysis', 'mediation', 'moderation_analysis', 'point_biserial', 'power_analysis'],
    },

    display: {
      denominator: 'respondents_who_answered',
      nullMeaning: 'missing',
      role: 'none',
    },
  },

  // ---------------------------------------------------------
  // 6. Segment
  // ---------------------------------------------------------
  segment: {
    label: 'Segment',
    description: 'Grouping variable used to split analysis. Not analyzed on its own.',
    dataShape: '1 column. Each row = group label (e.g., "Male", "Region A", "Heavy User").',
    rawValueExample: '"Group A" or "18-24" or "Premium"',

    chart: {
      primaryChart: null,
      primaryChartRule: 'No chart on its own. Segment enables grouped bar charts and crosstabs on other question types.',
      segmentChart: null,
      yAxis: 'none',
      xAxis: 'none',
    },

    stats: {
      alwaysRun: [],
      withSegment: [],
      withMultipleItems: [],
      forbidden: ['frequency', 'cronbach', 'correlation', 'efa', 'regression', 'driver_analysis', 'mediation', 'moderation_analysis', 'point_biserial', 'power_analysis'],
    },

    display: {
      denominator: 'not_applicable',
      nullMeaning: 'missing',
      role: 'split',
    },
  },

  // ---------------------------------------------------------
  // 7. Behavioral
  // ---------------------------------------------------------
  behavioral: {
    label: 'Behavioral Data',
    description: 'Continuous metric data from CRM, product usage, telemetry, or transactions. Not survey responses.',
    dataShape: '1 column per metric. Each row = numeric value (revenue, visits, time on site, etc.).',
    rawValueExample: '12500 or 3.7 or 0',

    chart: {
      primaryChart: 'histogram',
      primaryChartRule: 'Histogram showing distribution of values in bins. Box plot as secondary.',
      segmentChart: 'groupedBar',
      yAxis: 'value_bins',
      xAxis: 'count',
    },

    stats: {
      alwaysRun: ['descriptives'],
      withSegment: ['anova_oneway', 'segment_profile'],
      withMultipleItems: ['correlation'],
      forbidden: ['frequency', 'crosstab', 'kw_significance', 'cronbach', 'efa', 'segment_profile', 'posthoc', 'power_analysis'],
    },

    display: {
      denominator: 'respondents_who_answered',
      nullMeaning: 'missing',
      role: 'analyze',
    },
  },
}

// ============================================================
// Helpers
// ============================================================

/** Get contract for a column type. Throws if unknown. */
export function getContract(type: ColumnType): TypeContract {
  const contract = TYPE_CONTRACT[type]
  if (!contract) throw new Error(`Unknown column type: "${type}". Valid types: ${Object.keys(TYPE_CONTRACT).join(', ')}`)
  return contract
}

/** Check if a plugin is allowed for a column type */
export function isPluginAllowed(type: ColumnType, pluginId: string): boolean {
  return !getContract(type).stats.forbidden.includes(pluginId)
}

/** Check if a plugin should always run for a column type */
export function isPluginRequired(type: ColumnType, pluginId: string): boolean {
  return getContract(type).stats.alwaysRun.includes(pluginId)
}

/** Get the primary chart type for a column type. null = no chart. */
export function getPrimaryChart(type: ColumnType): 'horizontalBar' | 'histogram' | null {
  return getContract(type).chart.primaryChart
}

/** Get all valid column type values */
export function getAllColumnTypes(): ColumnType[] {
  return Object.keys(TYPE_CONTRACT) as ColumnType[]
}

/** Check if a type is a survey question (vs data column) */
export function isSurveyType(type: ColumnType): type is SurveyQuestionType {
  return ['radio', 'radio_grid', 'checkbox', 'checkbox_grid', 'open_ended'].includes(type)
}

/** Check if a type is a data column (vs survey question) */
export function isDataType(type: ColumnType): type is DataColumnType {
  return ['segment', 'behavioral'].includes(type)
}
