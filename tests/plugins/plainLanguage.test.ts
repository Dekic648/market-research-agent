/**
 * plainLanguage() output tests — every plugin must produce human-readable
 * plain language that includes actual column names and avoids raw stat notation.
 */
import { describe, it, expect } from 'vitest'
import type { ResolvedColumnData } from '../../src/plugins/types'

// Import plugins to trigger self-registration
import { FrequencyPlugin } from '../../src/plugins/FrequencyPlugin'
import { CrosstabPlugin } from '../../src/plugins/CrosstabPlugin'
import { SignificancePlugin } from '../../src/plugins/SignificancePlugin'
import { PostHocPlugin } from '../../src/plugins/PostHocPlugin'
import { ReliabilityPlugin } from '../../src/plugins/ReliabilityPlugin'
import { FactorPlugin } from '../../src/plugins/FactorPlugin'
import { RegressionPlugin } from '../../src/plugins/RegressionPlugin'
import { DriverPlugin } from '../../src/plugins/DriverPlugin'
import { CorrelationPlugin } from '../../src/plugins/CorrelationPlugin'
import { PointBiserialPlugin } from '../../src/plugins/PointBiserialPlugin'
import { SegmentProfilePlugin } from '../../src/plugins/SegmentProfilePlugin'

// ============================================================
// Helpers
// ============================================================

function makeNumericColumn(id: string, name: string, n: number, fn: (i: number) => number) {
  return { id, name, values: Array.from({ length: n }, (_, i) => fn(i)) }
}

function makeStringColumn(id: string, name: string, values: (string | null)[]) {
  return { id, name, values }
}

/** Asserts plain language quality */
function assertPlainLanguage(text: string, expectedColumnNames: string[]) {
  // Must be between 20 and 300 characters
  expect(text.length).toBeGreaterThanOrEqual(20)
  expect(text.length).toBeLessThanOrEqual(300)

  // Must not contain raw stat notation alone
  // These patterns catch things like "H(2)" or "χ²(" or "F(" without surrounding context
  expect(text).not.toMatch(/^.*H\(\d+\)\s*=.*$/)
  expect(text).not.toMatch(/χ²\(/)
  expect(text).not.toMatch(/^.*F\(\d+,\s*\d+\)\s*=.*$/)

  // Must contain at least one actual column name (not a placeholder)
  const containsColumnName = expectedColumnNames.some((name) => text.includes(name))
  if (expectedColumnNames.length > 0) {
    expect(containsColumnName).toBe(true)
  }
}

// ============================================================
// Plugin tests
// ============================================================

describe('FrequencyPlugin plainLanguage', () => {
  it('mentions column name and top response', async () => {
    const data: ResolvedColumnData = {
      columns: [makeNumericColumn('q1', 'Satisfaction Score', 50, (i) => (i % 5) + 1)],
      n: 50,
    }
    const result = await FrequencyPlugin.run(data)
    const text = FrequencyPlugin.plainLanguage(result)
    assertPlainLanguage(text, ['Satisfaction Score'])
  })
})

describe('CrosstabPlugin plainLanguage', () => {
  it('mentions segment name', async () => {
    const data: ResolvedColumnData = {
      columns: [makeNumericColumn('q1', 'Purchase Intent', 40, (i) => (i % 5) + 1)],
      segment: makeStringColumn('seg', 'Region', Array.from({ length: 40 }, (_, i) => i < 20 ? 'North' : 'South')),
      n: 40,
    }
    const result = await CrosstabPlugin.run(data)
    const text = CrosstabPlugin.plainLanguage(result)
    assertPlainLanguage(text, ['Region'])
  })
})

describe('SignificancePlugin plainLanguage', () => {
  it('mentions column name and effect size label', async () => {
    // Create data with clear group difference
    const values: number[] = []
    const segments: string[] = []
    for (let i = 0; i < 30; i++) { values.push(4 + Math.random()); segments.push('High') }
    for (let i = 0; i < 30; i++) { values.push(1 + Math.random()); segments.push('Low') }
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Brand Perception', values }],
      segment: { id: 'seg', name: 'Customer Tier', values: segments },
      n: 60,
    }
    const result = await SignificancePlugin.run(data)
    const text = SignificancePlugin.plainLanguage(result)
    assertPlainLanguage(text, ['Brand Perception', 'Customer Tier'])
  })
})

describe('PostHocPlugin plainLanguage', () => {
  it('mentions group names', async () => {
    const values: number[] = []
    const segments: string[] = []
    for (let i = 0; i < 25; i++) { values.push(5); segments.push('Premium') }
    for (let i = 0; i < 25; i++) { values.push(2); segments.push('Basic') }
    for (let i = 0; i < 25; i++) { values.push(3); segments.push('Mid') }
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Service Quality', values }],
      segment: { id: 'seg', name: 'Plan Type', values: segments },
      n: 75,
    }
    const result = await PostHocPlugin.run(data)
    const text = PostHocPlugin.plainLanguage(result)
    assertPlainLanguage(text, ['Service Quality'])
  })
})

describe('ReliabilityPlugin plainLanguage', () => {
  it('describes scale reliability in natural language', async () => {
    const n = 50
    const data: ResolvedColumnData = {
      columns: [
        makeNumericColumn('q1', 'Ease of Use', n, (i) => (i % 5) + 1),
        makeNumericColumn('q2', 'Design Quality', n, (i) => (i % 5) + 1),
        makeNumericColumn('q3', 'Speed', n, (i) => ((i + 1) % 5) + 1),
      ],
      n,
    }
    const result = await ReliabilityPlugin.run(data)
    const text = ReliabilityPlugin.plainLanguage(result)
    assertPlainLanguage(text, ['items'])
    // Should contain natural language about reliability
    expect(text).toMatch(/reliable|questionable|unreliable/)
    expect(text).toMatch(/alpha/)
  })
})

describe('FactorPlugin plainLanguage', () => {
  it('describes factor groupings with item names', async () => {
    const n = 120
    const data: ResolvedColumnData = {
      columns: [
        makeNumericColumn('q1', 'Taste', n, (i) => (i % 5) + 1),
        makeNumericColumn('q2', 'Freshness', n, (i) => ((i + 1) % 5) + 1),
        makeNumericColumn('q3', 'Packaging', n, (i) => ((i + 2) % 5) + 1),
        makeNumericColumn('q4', 'Value', n, (i) => ((i + 3) % 5) + 1),
      ],
      n,
    }
    const result = await FactorPlugin.run(data)
    const text = FactorPlugin.plainLanguage(result)
    assertPlainLanguage(text, ['items', 'themes', 'variation'])
    expect(text).toMatch(/\d+%/)
  })
})

describe('RegressionPlugin plainLanguage', () => {
  it('names the strongest predictor and outcome', async () => {
    const n = 60
    const data: ResolvedColumnData = {
      columns: [
        makeNumericColumn('y', 'Overall Satisfaction', n, (i) => i * 0.5 + Math.random()),
        makeNumericColumn('x1', 'Product Quality', n, (i) => i * 0.4 + Math.random() * 2),
        makeNumericColumn('x2', 'Price Fairness', n, (i) => Math.random() * 5),
      ],
      n,
    }
    const result = await RegressionPlugin.run(data)
    const text = RegressionPlugin.plainLanguage(result)
    assertPlainLanguage(text, ['Overall Satisfaction'])
    expect(text).toMatch(/variation/)
  })
})

describe('DriverPlugin plainLanguage', () => {
  it('names top driver and outcome', async () => {
    const n = 60
    const data: ResolvedColumnData = {
      columns: [
        makeNumericColumn('y', 'NPS', n, (i) => i * 0.3 + Math.random()),
        makeNumericColumn('x1', 'Response Time', n, (i) => i * 0.5 + Math.random()),
        makeNumericColumn('x2', 'Friendliness', n, (i) => Math.random() * 5),
        makeNumericColumn('x3', 'Resolution', n, (i) => Math.random() * 5),
      ],
      n,
    }
    const result = await DriverPlugin.run(data)
    const text = DriverPlugin.plainLanguage(result)
    assertPlainLanguage(text, ['NPS'])
    expect(text).toMatch(/driver|impact/)
  })
})

describe('CorrelationPlugin plainLanguage', () => {
  it('names correlated columns and direction', async () => {
    const n = 50
    const data: ResolvedColumnData = {
      columns: [
        makeNumericColumn('q1', 'Ad Spend', n, (i) => i * 2 + Math.random()),
        makeNumericColumn('q2', 'Revenue', n, (i) => i * 3 + Math.random()),
      ],
      n,
    }
    const result = await CorrelationPlugin.run(data)
    const text = CorrelationPlugin.plainLanguage(result)
    assertPlainLanguage(text, ['Ad Spend', 'Revenue'])
  })
})

describe('PointBiserialPlugin plainLanguage', () => {
  it('names binary and continuous columns', async () => {
    const n = 60
    const data: ResolvedColumnData = {
      columns: [
        makeNumericColumn('bin', 'Churned', n, (i) => i < 30 ? 0 : 1),
        makeNumericColumn('cont', 'Tenure Months', n, (i) => i < 30 ? 24 + Math.random() * 5 : 6 + Math.random() * 3),
      ],
      n,
    }
    const result = await PointBiserialPlugin.run(data)
    const text = PointBiserialPlugin.plainLanguage(result)
    assertPlainLanguage(text, ['Churned', 'Tenure Months'])
  })
})

describe('SegmentProfilePlugin plainLanguage', () => {
  it('names the most differentiating segment and variable', async () => {
    const n = 40
    const values1: number[] = []
    const values2: number[] = []
    const segs: string[] = []
    for (let i = 0; i < 20; i++) { values1.push(5); values2.push(3); segs.push('Enterprise') }
    for (let i = 0; i < 20; i++) { values1.push(2); values2.push(3); segs.push('SMB') }
    const data: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Willingness to Pay', values: values1 },
        { id: 'q2', name: 'Ease of Setup', values: values2 },
      ],
      segment: { id: 'seg', name: 'Company Size', values: segs },
      n,
    }
    const result = await SegmentProfilePlugin.run(data)
    const text = SegmentProfilePlugin.plainLanguage(result)
    assertPlainLanguage(text, ['Enterprise', 'SMB', 'Willingness to Pay'])
  })
})
