/**
 * ReportSchema — serializable JSON, not a component tree.
 *
 * Rules:
 * - No renderer-specific properties (no slide counts, no font sizes)
 * - Must be re-runnable against new data
 * - Every findingId and chartId references an AnalysisLog entry
 */

export interface ReportSchema {
  id: string
  version: number
  createdAt: number
  createdBy: string

  sourceDatasetIds: string[]
  analysisLogSnapshot: string[]

  sections: ReportSection[]
}

export type ReportSection =
  | ExecutiveSummarySection
  | FindingSection
  | ChartSection
  | NarrativeSection
  | AINarrativeSection
  | SegmentProfileSection
  | DriverSection
  | ConditionalSection

export interface ExecutiveSummarySection {
  type: 'executive_summary'
  findingRefs: string[]
}

export interface FindingSection {
  type: 'finding'
  findingId: string
  theme?: string
}

export interface ChartSection {
  type: 'chart'
  chartId: string
  caption?: string
}

export interface NarrativeSection {
  type: 'narrative'
  text: string
}

export interface AINarrativeSection {
  type: 'ai_narrative'
  prompt: string
  cachedResult: string | null
  generatedAt: number | null
}

export interface SegmentProfileSection {
  type: 'segment_profile'
  segmentId: string
}

export interface DriverSection {
  type: 'driver'
  outcomeVariable: string
}

export interface ConditionalSection {
  type: 'conditional'
  showIf: string
  section: ReportSection
}

/**
 * Create an empty report schema.
 */
export function createReportSchema(params: {
  createdBy: string
  sourceDatasetIds: string[]
  analysisLogSnapshot: string[]
}): ReportSchema {
  return {
    id: 'report_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    version: 1,
    createdAt: Date.now(),
    createdBy: params.createdBy,
    sourceDatasetIds: params.sourceDatasetIds,
    analysisLogSnapshot: params.analysisLogSnapshot,
    sections: [],
  }
}

/**
 * Add a section to a report schema. Returns a new schema — never mutates.
 */
export function addSection(
  schema: ReportSchema,
  section: ReportSection
): ReportSchema {
  return {
    ...schema,
    sections: [...schema.sections, section],
  }
}

/**
 * Remove a section by index. Returns a new schema.
 */
export function removeSection(
  schema: ReportSchema,
  index: number
): ReportSchema {
  return {
    ...schema,
    sections: schema.sections.filter((_, i) => i !== index),
  }
}

/**
 * Reorder sections. Returns a new schema.
 */
export function reorderSections(
  schema: ReportSchema,
  fromIndex: number,
  toIndex: number
): ReportSchema {
  const sections = [...schema.sections]
  const [moved] = sections.splice(fromIndex, 1)
  sections.splice(toIndex, 0, moved)
  return { ...schema, sections }
}

/**
 * Build an auto-report schema from ordered findings.
 * Groups findings into sections by tier, with executive summary
 * narrative nodes and a warnings section at the end.
 */
export function buildAutoReportSchema(
  findings: import('../../types/dataTypes').Finding[],
  summaryStrings: string[]
): ReportSchema {
  const REPORT_PRIORITY: Record<string, number> = {
    frequency: 1, crosstab: 2, segment_profile: 2,
    kw_significance: 3, posthoc: 3,
    correlation: 4, point_biserial: 4,
    cronbach: 5, efa: 5,
    regression: 6, driver_analysis: 6,
  }

  const TIER_NAMES: Record<number, string> = {
    1: 'Frequencies and distributions',
    2: 'Segment breakdowns',
    3: 'Group differences',
    4: 'Relationships between variables',
    5: 'Scale structure and reliability',
    6: 'Drivers and predictions',
  }

  const active = findings.filter((f) => !f.suppressed)
  const sections: ReportSection[] = []

  // Executive summary narrative at the top
  if (summaryStrings.length > 0) {
    sections.push({ type: 'narrative', text: summaryStrings.join('\n') })
  }

  // Group by tier
  const tiers = new Map<number, import('../../types/dataTypes').Finding[]>()
  for (const f of active) {
    const tier = REPORT_PRIORITY[f.stepId] ?? 99
    if (!tiers.has(tier)) tiers.set(tier, [])
    tiers.get(tier)!.push(f)
  }

  // Build sections per tier
  for (const tier of Array.from(tiers.keys()).sort((a, b) => a - b)) {
    const tierFindings = tiers.get(tier)!
    const tierName = TIER_NAMES[tier] ?? `Other`

    // Tier summary sentence
    const tierSummary = summaryStrings.find((_, i) => {
      // Match summary to tier by position — summaryStrings are in tier order
      // But some tiers may be missing, so this is best-effort
      return true
    })

    // Section header as narrative
    sections.push({ type: 'narrative', text: `## ${tierName}` })

    // Finding nodes
    for (const f of tierFindings) {
      sections.push({ type: 'finding', findingId: f.id })
    }
  }

  // Warnings section
  const warned = active.filter(
    (f) => f.verificationResults?.some((vr) => vr.severity === 'warning')
  )
  if (warned.length > 0) {
    sections.push({ type: 'narrative', text: '## Results requiring attention' })
    for (const f of warned) {
      const warnings = f.verificationResults
        ?.filter((vr) => vr.severity === 'warning')
        .map((vr) => vr.message)
        .join('; ') ?? ''
      sections.push({
        type: 'narrative',
        text: `${f.title}: ${warnings}`,
      })
    }
  }

  return {
    id: 'auto_report_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    version: 1,
    createdAt: Date.now(),
    createdBy: 'auto',
    sourceDatasetIds: [],
    analysisLogSnapshot: [],
    sections,
  }
}
