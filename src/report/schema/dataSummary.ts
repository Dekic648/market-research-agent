/**
 * Data summary builder — generates a structured overview of the dataset.
 * Used by DataSummaryCard for orientation before analysis.
 */

import type { QuestionBlock, QuestionFormat } from '../../types/dataTypes'
import { parseTimestamp } from '../../engine/timeUtils'

export interface DataFamily {
  label: string
  count: number
  preview: string[]
  subgroups?: string[]
  dateRange?: string
}

export interface DataSummary {
  rowCount: number
  families: DataFamily[]
  availableAnalysisCount: number
}

const TYPE_FAMILIES: Record<string, string> = {
  rating: 'Survey questions',
  matrix: 'Survey questions',
  checkbox: 'Survey questions',
  verbatim: 'Survey questions',
  behavioral: 'Behavioral data',
  category: 'Segments',
  radio: 'Segments',
  timestamped: 'Time data',
  weight: 'Weighting column',
}

const SURVEY_SUBTYPE_LABELS: Record<string, string> = {
  rating: 'rating scale',
  matrix: 'rating scale',
  checkbox: 'checkbox question',
  verbatim: 'open text question',
}

function pluralize(n: number, singular: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${singular}s`
}

function formatMonth(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

export function buildDataSummary(
  blocks: QuestionBlock[],
  rowCount: number,
  availableAnalysisCount: number
): DataSummary {
  const confirmed = blocks.filter((b) => b.confirmed && b.columns.length > 0)

  // Group blocks by family
  const familyMap = new Map<string, QuestionBlock[]>()
  for (const block of confirmed) {
    const family = TYPE_FAMILIES[block.format] ?? 'Other'
    if (!familyMap.has(family)) familyMap.set(family, [])
    familyMap.get(family)!.push(block)
  }

  const families: DataFamily[] = []

  // Process each family
  const familyOrder = ['Survey questions', 'Behavioral data', 'Segments', 'Time data', 'Weighting column']

  for (const familyName of familyOrder) {
    const familyBlocks = familyMap.get(familyName)
    if (!familyBlocks || familyBlocks.length === 0) continue

    const allCols = familyBlocks.flatMap((b) => b.columns)
    const preview = allCols.slice(0, 3).map((c) => c.name)

    const family: DataFamily = {
      label: familyName,
      count: allCols.length,
      preview,
    }

    // Survey subgroups
    if (familyName === 'Survey questions') {
      const subtypeCounts = new Map<string, number>()
      for (const block of familyBlocks) {
        const subLabel = SURVEY_SUBTYPE_LABELS[block.format] ?? block.format
        subtypeCounts.set(subLabel, (subtypeCounts.get(subLabel) ?? 0) + block.columns.length)
      }
      family.subgroups = Array.from(subtypeCounts.entries())
        .map(([label, count]) => pluralize(count, label))
    }

    // Date range for Time data
    if (familyName === 'Time data') {
      const dates: Date[] = []
      for (const col of allCols) {
        for (let i = 0; i < Math.min(col.rawValues.length, 50); i++) {
          const d = parseTimestamp(col.rawValues[i])
          if (d) dates.push(d)
        }
      }
      if (dates.length >= 2) {
        dates.sort((a, b) => a.getTime() - b.getTime())
        family.dateRange = `${formatMonth(dates[0])} – ${formatMonth(dates[dates.length - 1])}`
      }
    }

    families.push(family)
  }

  return { rowCount, families, availableAnalysisCount }
}
