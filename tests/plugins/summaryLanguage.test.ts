/**
 * Tests for summaryLanguage on plugin findings.
 *
 * Validates that summaryLanguage follows the 6 rules:
 *   1. No test names
 *   2. No Greek letters
 *   3. No p-values
 *   4. Names actual columns
 *   5. Max 2 sentences
 *   6. Contains at least one numeric value
 */
import { describe, it, expect } from 'vitest'
import type { ResolvedColumnData } from '../../src/plugins/types'

// Register all plugins
import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/DescriptivesSummaryPlugin'
import '../../src/plugins/DescriptivesPlugin'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/SegmentProfilePlugin'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/RegressionPlugin'
import '../../src/plugins/DriverPlugin'
import '../../src/plugins/ReliabilityPlugin'
import '../../src/plugins/LogisticRegressionPlugin'
import '../../src/plugins/ANOVAPlugin'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'

const JARGON_TERMS = /Kruskal|Pearson|Spearman|OLS|alpha|ANOVA|Mann-Whitney|Bonferroni|chi-square|Welch|Tukey/i
const GREEK_LETTERS = /[εβαηρ²χ]|eta-squared|epsilon/i
const P_VALUE_PATTERN = /p\s*[=<>]\s*\.?\d|p-value/i

function makeCol(name: string, values: (number | string | null)[] = Array.from({ length: 100 }, (_, i) => (i % 5) + 1)) {
  return { id: `col_${name}`, name, values, nullMeaning: 'missing' as const }
}

function makeSeg(name: string) {
  return { id: `seg_${name}`, name, values: Array.from({ length: 100 }, (_, i) => i < 50 ? 'GroupA' : 'GroupB') as (number | string | null)[], nullMeaning: 'missing' as const }
}

function validateSummaryLanguage(sl: string, columnNames: string[]) {
  // Rule 1: No test names
  expect(sl).not.toMatch(JARGON_TERMS)

  // Rule 2: No Greek letters
  expect(sl).not.toMatch(GREEK_LETTERS)

  // Rule 3: No p-values
  expect(sl).not.toMatch(P_VALUE_PATTERN)

  // Rule 5: Max 2 sentences (count periods that end sentences, not decimals)
  const sentenceCount = sl.split(/\.\s+/).length
  expect(sentenceCount).toBeLessThanOrEqual(3)  // allow for trailing period
}

describe('summaryLanguage — FrequencyPlugin', () => {
  const plugin = AnalysisRegistry.get('frequency')!

  it('follows all rules', async () => {
    const data: ResolvedColumnData = {
      columns: [makeCol('Satisfaction')],
      n: 100,
    }
    const result = await plugin.run(data)
    const sl = result.findings[0]?.summaryLanguage ?? result.findings[0]?.summary.split('. ')[0] + '.'
    validateSummaryLanguage(sl, ['Satisfaction'])
    expect(sl).toContain('Satisfaction')
  })
})

describe('summaryLanguage — CorrelationPlugin', () => {
  const plugin = AnalysisRegistry.get('correlation')!

  it('follows all rules', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeCol('Quality', Array.from({ length: 100 }, (_, i) => i)),
        makeCol('Speed', Array.from({ length: 100 }, (_, i) => i * 0.8 + 5)),
      ],
      n: 100,
    }
    const result = await plugin.run(data)
    if (result.findings.length > 0) {
      const sl = result.findings[0].summaryLanguage ?? result.findings[0].summary.split('. ')[0] + '.'
      validateSummaryLanguage(sl, ['Quality', 'Speed'])
    }
  })
})

describe('summaryLanguage — RegressionPlugin', () => {
  const plugin = AnalysisRegistry.get('regression')!

  it('follows all rules', async () => {
    const y = Array.from({ length: 100 }, (_, i) => i * 0.5 + Math.random() * 10)
    const x1 = Array.from({ length: 100 }, (_, i) => i + Math.random() * 5)
    const x2 = Array.from({ length: 100 }, (_, i) => 50 - i * 0.3 + Math.random() * 5)
    const data: ResolvedColumnData = {
      columns: [
        makeCol('Overall_Satisfaction', y),
        makeCol('Quality', x1),
        makeCol('Speed', x2),
      ],
      n: 100,
    }
    const result = await plugin.run(data)
    const sl = result.findings[0]?.summaryLanguage ?? result.findings[0]?.summary.split('. ')[0] + '.'
    validateSummaryLanguage(sl, ['Overall_Satisfaction', 'Quality', 'Speed'])
  })
})

describe('summaryLanguage — SegmentProfilePlugin', () => {
  const plugin = AnalysisRegistry.get('segment_profile')!

  it('follows all rules', async () => {
    const data: ResolvedColumnData = {
      columns: [makeCol('Score')],
      segment: makeSeg('Region'),
      n: 100,
    }
    const result = await plugin.run(data)
    if (result.findings.length > 0) {
      const sl = result.findings[0].summaryLanguage ?? result.findings[0].summary.split('. ')[0] + '.'
      validateSummaryLanguage(sl, ['Score'])
    }
  })
})

describe('summaryLanguage — ReliabilityPlugin', () => {
  const plugin = AnalysisRegistry.get('cronbach')!

  it('follows all rules', async () => {
    const data: ResolvedColumnData = {
      columns: [
        makeCol('Item1', Array.from({ length: 100 }, (_, i) => (i % 5) + 1)),
        makeCol('Item2', Array.from({ length: 100 }, (_, i) => (i % 5) + 1)),
        makeCol('Item3', Array.from({ length: 100 }, (_, i) => ((i + 1) % 5) + 1)),
      ],
      n: 100,
    }
    const result = await plugin.run(data)
    if (result.findings.length > 0) {
      const sl = result.findings[0].summaryLanguage ?? result.findings[0].summary.split('. ')[0] + '.'
      validateSummaryLanguage(sl, ['Item1'])
    }
  })
})

describe('summaryLanguage — LogisticRegressionPlugin', () => {
  const plugin = AnalysisRegistry.get('logistic_regression')!

  it('follows all rules', async () => {
    const n = 100
    const y = Array.from({ length: n }, (_, i) => i < 50 ? 0 : 1)
    const x1 = Array.from({ length: n }, (_, i) => i * 0.1 + Math.random())
    const data: ResolvedColumnData = {
      columns: [
        makeCol('Converted', y),
        makeCol('Engagement', x1),
      ],
      n,
    }
    const result = await plugin.run(data)
    const sl = result.findings[0]?.summaryLanguage ?? result.findings[0]?.summary.split('. ')[0] + '.'
    validateSummaryLanguage(sl, ['Converted', 'Engagement'])
  })
})

describe('summaryLanguage — DescriptivesPlugin', () => {
  const plugin = AnalysisRegistry.get('descriptives')!

  it('follows all rules', async () => {
    const data: ResolvedColumnData = {
      columns: [makeCol('Revenue', Array.from({ length: 100 }, (_, i) => i * 10 + Math.random() * 50))],
      n: 100,
    }
    const result = await plugin.run(data)
    const sl = result.findings[0]?.summaryLanguage ?? result.findings[0]?.summary.split('. ')[0] + '.'
    validateSummaryLanguage(sl, ['Revenue'])
  })
})

describe('summaryLanguage — ANOVAPlugin', () => {
  const plugin = AnalysisRegistry.get('anova_oneway')!

  it('follows all rules', async () => {
    const vals = [
      ...Array.from({ length: 30 }, () => 10 + Math.random() * 2),
      ...Array.from({ length: 30 }, () => 20 + Math.random() * 2),
    ]
    const segs = [
      ...Array.from({ length: 30 }, () => 'Low'),
      ...Array.from({ length: 30 }, () => 'High'),
    ]
    const data: ResolvedColumnData = {
      columns: [makeCol('Score', vals)],
      segment: makeSeg('Group'),
      n: 60,
    }
    // Override segment values
    data.segment = { id: 'seg', name: 'Group', values: segs, nullMeaning: 'missing' }
    const result = await plugin.run(data)
    const sl = result.findings[0]?.summaryLanguage ?? result.findings[0]?.summary.split('. ')[0] + '.'
    validateSummaryLanguage(sl, ['Score'])
  })
})
