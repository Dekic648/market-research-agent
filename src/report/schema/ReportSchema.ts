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
