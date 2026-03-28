/**
 * groupFindings — pure function that groups findings into method sections
 * with question sub-groups.
 *
 * No store imports. No React. Pure data transformation.
 */

import type { Finding, ChartConfig } from '../types/dataTypes'
import type { PluginStepResult } from '../plugins/types'
import { METHOD_GROUPS, SECTION_BY_KEY, PLUGIN_ORDER_WITHIN_SECTION } from './methodGroups'
import type { MethodGroupDef } from './methodGroups'

// ============================================================
// Output types
// ============================================================

export interface QuestionGroupData {
  /** Unique key for this question group (sourceTaskId or derived) */
  questionKey: string
  /** Display label — e.g. "Q2: Service Attributes" */
  label: string
  /** Findings in this group, sorted by plugin dependency order */
  findings: Finding[]
  /** Whether the primary finding is significant */
  primarySignificant: boolean
  /** Charts associated with this group's findings */
  charts: ChartConfig[]
  /** Plain language summary for this group */
  plainLanguage: string
}

export interface MethodSectionData {
  /** Section key — e.g. 'distributions', 'group_comparisons' */
  key: string
  /** Display label — e.g. 'Distributions', 'Group Comparisons' */
  label: string
  /** Sort order */
  order: number
  /** Question groups within this section */
  questionGroups: QuestionGroupData[]
  /** Total finding count across all groups */
  findingCount: number
}

// ============================================================
// Grouping logic
// ============================================================

/**
 * Derive a question key from a finding.
 * Uses sourceTaskId when available, falls back to a combination of
 * stepId + first column name from title.
 */
function deriveQuestionKey(f: Finding): string {
  if (f.sourceTaskId) return f.sourceTaskId
  // Fallback: use stepId + title hash for uniqueness
  return `${f.stepId}_${f.title.slice(0, 40)}`
}

/**
 * Derive a display label for a question group from its findings.
 */
function deriveGroupLabel(findings: Finding[]): string {
  // Prefer sourceQuestionLabel from the first finding that has one
  for (const f of findings) {
    if (f.sourceQuestionLabel) return f.sourceQuestionLabel
  }
  // Fallback: use source columns
  for (const f of findings) {
    if (f.sourceColumns && f.sourceColumns.length > 0) {
      return f.sourceColumns.join(', ')
    }
  }
  // Last resort: first finding title
  return findings[0]?.title ?? 'Analysis'
}

/**
 * Get the section key for a finding, with special handling for posthoc
 * (should stay in group_comparisons with its parent KW test).
 */
function getSectionForFinding(f: Finding): string {
  return METHOD_GROUPS[f.stepId] ?? 'other'
}

/**
 * Group findings by method section and question, enriched with step result data.
 *
 * @param findings - All findings from the run (unsuppressed)
 * @param taskStepResults - Map from taskId to PluginStepResult for charts/plainLanguage
 * @returns Sorted array of method sections with nested question groups
 */
export function groupFindings(
  findings: Finding[],
  taskStepResults?: Record<string, PluginStepResult>
): MethodSectionData[] {
  const active = findings.filter((f) => !f.suppressed)

  // Step 1: Group findings by section key
  const sectionMap = new Map<string, Finding[]>()
  for (const f of active) {
    const sectionKey = getSectionForFinding(f)
    if (!sectionMap.has(sectionKey)) sectionMap.set(sectionKey, [])
    sectionMap.get(sectionKey)!.push(f)
  }

  // Step 2: For each section, group by question
  const sections: MethodSectionData[] = []

  for (const [sectionKey, sectionFindings] of sectionMap) {
    const def: MethodGroupDef = SECTION_BY_KEY[sectionKey] ?? { key: 'other', label: 'Other', order: 99 }

    // Group by question key
    const questionMap = new Map<string, Finding[]>()
    // Track insertion order for paste-order sorting
    const questionOrder: string[] = []

    for (const f of sectionFindings) {
      const qKey = deriveQuestionKey(f)

      // PostHoc findings attach to their parent KW significance question group
      if (f.stepId === 'posthoc') {
        // Find the KW group with matching columns
        const parentKey = findParentKWKey(f, questionMap, sectionFindings)
        if (parentKey) {
          questionMap.get(parentKey)!.push(f)
          continue
        }
      }

      if (!questionMap.has(qKey)) {
        questionMap.set(qKey, [])
        questionOrder.push(qKey)
      }
      questionMap.get(qKey)!.push(f)
    }

    // Step 3: Build question groups, sorted by paste order (insertion order)
    const questionGroups: QuestionGroupData[] = []

    for (const qKey of questionOrder) {
      const qFindings = questionMap.get(qKey)!

      // Sort within group by plugin dependency order
      qFindings.sort((a, b) => {
        const orderA = PLUGIN_ORDER_WITHIN_SECTION[a.stepId] ?? 50
        const orderB = PLUGIN_ORDER_WITHIN_SECTION[b.stepId] ?? 50
        return orderA - orderB
      })

      // Get charts and plainLanguage from step results
      let charts: ChartConfig[] = []
      let plainLanguage = ''
      if (taskStepResults) {
        const taskIds = new Set(qFindings.map((f) => f.sourceTaskId).filter(Boolean))
        for (const taskId of taskIds) {
          const sr = taskStepResults[taskId!]
          if (sr) {
            charts = charts.concat(sr.charts)
            if (sr.plainLanguage && !plainLanguage) {
              plainLanguage = sr.plainLanguage
            }
          }
        }
      }

      // Primary significance: check the first finding with a p-value
      const primaryFinding = qFindings.find((f) => f.pValue !== null) ?? qFindings[0]
      const primarySignificant = primaryFinding?.significant ?? false

      questionGroups.push({
        questionKey: qKey,
        label: deriveGroupLabel(qFindings),
        findings: qFindings,
        primarySignificant,
        charts,
        plainLanguage,
      })
    }

    sections.push({
      key: sectionKey,
      label: def.label,
      order: def.order,
      questionGroups,
      findingCount: sectionFindings.length,
    })
  }

  // Step 4: Sort sections by order
  sections.sort((a, b) => a.order - b.order)

  return sections
}

/**
 * Find the parent KW significance question key for a posthoc finding.
 * Matches by overlapping source columns.
 */
function findParentKWKey(
  posthocFinding: Finding,
  questionMap: Map<string, Finding[]>,
  allSectionFindings: Finding[]
): string | null {
  const posthocCols = posthocFinding.sourceColumns ?? []
  if (posthocCols.length === 0) return null

  // Look for a KW finding with matching columns
  for (const [qKey, findings] of questionMap) {
    const kwFinding = findings.find((f) => f.stepId === 'kw_significance')
    if (!kwFinding) continue
    const kwCols = kwFinding.sourceColumns ?? []
    // Check if columns overlap (same question context)
    if (kwCols.length > 0 && posthocCols.some((c) => kwCols.includes(c))) {
      return qKey
    }
  }

  return null
}
