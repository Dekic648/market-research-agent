/**
 * Full pipeline integration test — catches #306-type errors
 * by verifying every rendered value is a string or number, never an object.
 */
import { describe, it, expect } from 'vitest'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import { CapabilityMatcher } from '../../src/engine/CapabilityMatcher'
import { HeadlessRunner } from '../../src/runners/HeadlessRunner'
import { resolveColumn } from '../../src/engine/resolveColumn'
import type { ColumnDefinition, DatasetNode } from '../../src/types/dataTypes'

import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/CrosstabPlugin'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/PostHocPlugin'
import '../../src/plugins/ReliabilityPlugin'
import '../../src/plugins/FactorPlugin'
import '../../src/plugins/RegressionPlugin'
import '../../src/plugins/DriverPlugin'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/PointBiserialPlugin'
import '../../src/plugins/SegmentProfilePlugin'

function makeCol(id: string, name: string, type: ColumnDefinition['type'], values: (number | string | null)[]): ColumnDefinition {
  return {
    id, name, type, nRows: values.length,
    nMissing: values.filter(v => v === null).length,
    rawValues: values, fingerprint: null, semanticDetectionCache: null,
    transformStack: [], sensitivity: 'anonymous', declaredScaleRange: null,
  }
}

const n = 50
const q1 = Array.from({ length: n }, (_, i) => (i % 5) + 1)
const q2 = Array.from({ length: n }, (_, i) => ((i + 1) % 5) + 1)
const q3 = Array.from({ length: n }, (_, i) => ((i + 2) % 5) + 1)
const seg = Array.from({ length: n }, (_, i) => i < 25 ? 'A' : 'B')

const node: DatasetNode = {
  id: 'n1', label: 'Test',
  parsedData: {
    groups: [{
      questionType: 'rating',
      columns: [makeCol('q1', 'Q1', 'rating', q1), makeCol('q2', 'Q2', 'rating', q2), makeCol('q3', 'Q3', 'rating', q3)],
      label: 'Scale',
    }],
    segments: makeCol('seg', 'Segment', 'category', seg),
  },
  weights: null, readonly: false, source: 'user', dataVersion: 1, createdAt: Date.now(),
}

describe('Full pipeline — no objects in rendered values', () => {
  it('runs all plugins and produces only string/number values for React render', async () => {
    const allColumns = node.parsedData.groups.flatMap(g => g.columns)
    const resolvedColumns = allColumns.map(c => ({
      id: c.id, name: c.name, values: resolveColumn(c),
    }))
    const segCol = node.parsedData.segments!
    const resolvedSeg = { id: segCol.id, name: segCol.name, values: resolveColumn(segCol) }

    const data = { columns: resolvedColumns, segment: resolvedSeg, n }
    const caps = CapabilityMatcher.resolve(node)
    const plugins = AnalysisRegistry.queryOrdered(caps)

    expect(plugins.length).toBeGreaterThan(0)

    const runner = new HeadlessRunner({
      data, userId: 'anonymous', dataFingerprint: 'test',
      dataVersion: 1, sessionId: 'test',
    })

    const result = await runner.runAll(plugins)

    expect(result.completedPlugins.length).toBeGreaterThan(0)

    for (const step of result.stepResults) {
      // plainLanguage must be a string
      expect(typeof step.plainLanguage).toBe('string')
      expect(step.plainLanguage.length).toBeGreaterThan(0)

      // Every finding field that gets rendered must be string or number or null
      for (const f of step.findings) {
        expect(typeof f.title).toBe('string')
        expect(typeof f.summary).toBe('string')
        expect(typeof f.detail).toBe('string')
        if (f.pValue !== null) expect(typeof f.pValue).toBe('number')
        if (f.effectSize !== null) expect(typeof f.effectSize).toBe('number')
        if (f.effectLabel !== null) expect(typeof f.effectLabel).toBe('string')
      }

      // Every chart layout.title must be string or { text: string }
      for (const chart of step.charts) {
        const title = (chart.layout as any)?.title
        if (title !== undefined) {
          const isValidTitle = typeof title === 'string' || (typeof title === 'object' && typeof title?.text === 'string')
          expect(isValidTitle).toBe(true)
        }
      }

      // Every assumption message must be a string
      for (const a of step.assumptions) {
        expect(typeof a.message).toBe('string')
      }
    }
  })
})
