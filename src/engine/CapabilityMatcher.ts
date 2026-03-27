/**
 * CapabilityMatcher — resolves a dataset into a flat CapabilitySet.
 *
 * Reads column types, counts, n, segment presence.
 * Returns capabilities — never evaluates plugin names.
 * AnalysisRegistry.query(capabilities) does the matching.
 *
 * Rule: if you can grep for a plugin name inside this file,
 * the architecture is broken.
 */

import type { DatasetNode, ColumnDefinition, QuestionType } from '../types/dataTypes'
import type { CapabilitySet, DataCapability } from '../plugins/types'

export const CapabilityMatcher = {
  /**
   * Resolve a dataset node into a set of data capabilities.
   */
  resolve(node: DatasetNode): CapabilitySet {
    const caps = new Set<DataCapability>()
    const allColumns: ColumnDefinition[] = []

    for (const group of node.parsedData.groups) {
      for (const col of group.columns) {
        allColumns.push(col)
      }
    }

    if (allColumns.length === 0) return caps

    // Aggregate row count from first column
    const n = allColumns[0]?.nRows ?? 0
    if (n > 30) caps.add('n>30')
    if (n > 100) caps.add('n>100')

    // Check for segment column
    if (node.parsedData.segments) {
      caps.add('segment')
    }

    // Check for weight column
    if (node.weights) {
      caps.add('weighted')
    }

    // Scan column types
    const typeCounts: Partial<Record<QuestionType, number>> = {}
    for (const col of allColumns) {
      typeCounts[col.type] = (typeCounts[col.type] ?? 0) + 1
    }

    // Map question types to capabilities
    if (typeCounts['rating'] || typeCounts['matrix']) {
      caps.add('ordinal')
      caps.add('continuous') // ratings are treated as continuous for many analyses
    }
    if (typeCounts['category'] || typeCounts['radio']) {
      caps.add('categorical')
    }
    if (typeCounts['checkbox']) {
      caps.add('categorical')
      caps.add('binary')
    }
    if (typeCounts['behavioral']) {
      caps.add('continuous')
    }
    if (typeCounts['verbatim']) {
      caps.add('text')
    }
    if (typeCounts['timestamped']) {
      caps.add('temporal')
    }
    if (typeCounts['multi_assigned']) {
      caps.add('multiple_response')
      caps.add('categorical')
    }

    // Check for binary columns (any column with exactly 2 unique non-null values)
    for (const col of allColumns) {
      const unique = new Set(col.rawValues.filter((v) => v !== null))
      if (unique.size === 2) {
        caps.add('binary')
        break
      }
    }

    // Check for repeated measures (multiple columns of same type in a group)
    for (const group of node.parsedData.groups) {
      if (group.columns.length >= 3) {
        const allSameType = group.columns.every(
          (c) => c.type === group.columns[0].type
        )
        if (allSameType && (group.questionType === 'rating' || group.questionType === 'matrix')) {
          caps.add('repeated')
        }
      }
    }

    return caps
  },

  /**
   * Resolve capabilities from a subset of columns (for SelectionStore mode).
   */
  resolveFromColumns(
    columns: ColumnDefinition[],
    segment?: ColumnDefinition | null,
    weights?: ColumnDefinition | null
  ): CapabilitySet {
    const caps = new Set<DataCapability>()

    if (columns.length === 0) return caps

    const n = columns[0]?.nRows ?? 0
    if (n > 30) caps.add('n>30')
    if (n > 100) caps.add('n>100')

    if (segment) caps.add('segment')
    if (weights) caps.add('weighted')

    for (const col of columns) {
      switch (col.type) {
        case 'rating':
        case 'matrix':
          caps.add('ordinal')
          caps.add('continuous')
          break
        case 'category':
        case 'radio':
          caps.add('categorical')
          break
        case 'checkbox':
          caps.add('categorical')
          caps.add('binary')
          break
        case 'behavioral':
          caps.add('continuous')
          break
        case 'verbatim':
          caps.add('text')
          break
        case 'timestamped':
          caps.add('temporal')
          break
        case 'multi_assigned':
          caps.add('multiple_response')
          caps.add('categorical')
          break
      }

      const unique = new Set(col.rawValues.filter((v) => v !== null))
      if (unique.size === 2) caps.add('binary')
    }

    if (columns.length >= 3) {
      const allSameType = columns.every((c) => c.type === columns[0].type)
      if (allSameType && (columns[0].type === 'rating' || columns[0].type === 'matrix')) {
        caps.add('repeated')
      }
    }

    return caps
  },
}
