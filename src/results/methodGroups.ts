/**
 * METHOD_GROUPS — maps plugin IDs to display sections in the results page.
 *
 * Each section has a key, display label, and sort order.
 * Plugins not listed here fall into the catch-all 'other' section.
 */

export interface MethodGroupDef {
  key: string
  label: string
  order: number
}

const SECTION_DEFS: MethodGroupDef[] = [
  { key: 'distributions', label: 'Distributions', order: 1 },
  { key: 'reliability', label: 'Scale Reliability', order: 2 },
  { key: 'group_comparisons', label: 'Group Comparisons', order: 3 },
  { key: 'correlations', label: 'Correlations', order: 4 },
  { key: 'temporal', label: 'Trends Over Time', order: 5 },
  { key: 'drivers', label: 'Drivers & Prediction', order: 6 },
  { key: 'advanced', label: 'Advanced', order: 7 },
  { key: 'factor', label: 'Factor Structure', order: 8 },
  { key: 'other', label: 'Other', order: 99 },
]

/** Map from section key to its definition */
export const SECTION_BY_KEY: Record<string, MethodGroupDef> = {}
for (const def of SECTION_DEFS) {
  SECTION_BY_KEY[def.key] = def
}

/** Map from pluginId to section key */
export const METHOD_GROUPS: Record<string, string> = {
  descriptives_summary: 'distributions',
  descriptives: 'distributions',
  frequency: 'distributions',
  cronbach: 'reliability',
  anova_oneway: 'group_comparisons',
  kw_significance: 'group_comparisons',
  posthoc: 'group_comparisons',
  crosstab: 'group_comparisons',
  segment_profile: 'group_comparisons',
  correlation: 'correlations',
  point_biserial: 'correlations',
  trend_over_time: 'temporal',
  period_frequency: 'temporal',
  time_segment_comparison: 'temporal',
  regression: 'drivers',
  driver_analysis: 'drivers',
  logistic_regression: 'drivers',
  ordinal_regression: 'drivers',
  mediation: 'advanced',
  moderation_analysis: 'advanced',
  power_analysis: 'advanced',
  efa: 'factor',
}

/** Plugin ordering within a section — lower runs first, display first */
export const PLUGIN_ORDER_WITHIN_SECTION: Record<string, number> = {
  descriptives: 0,
  frequency: 1,
  crosstab: 2,
  segment_profile: 3,
  anova_oneway: 3.5,
  kw_significance: 4,
  posthoc: 5,
  correlation: 1,
  point_biserial: 2,
  cronbach: 1,
  efa: 1,
  trend_over_time: 1,
  period_frequency: 2,
  time_segment_comparison: 3,
  regression: 1,
  driver_analysis: 2,
  logistic_regression: 3,
  ordinal_regression: 4,
  mediation: 1,
  moderation_analysis: 2,
  power_analysis: 3,
}

/** Get the section key for a plugin ID */
export function getSectionKey(pluginId: string): string {
  return METHOD_GROUPS[pluginId] ?? 'other'
}

/** Get the section definition for a plugin ID */
export function getSectionDef(pluginId: string): MethodGroupDef {
  const key = getSectionKey(pluginId)
  return SECTION_BY_KEY[key] ?? { key: 'other', label: 'Other', order: 99 }
}
