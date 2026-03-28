/**
 * Runner tests — InteractiveRunner and HeadlessRunner.
 */
import { describe, it, expect } from 'vitest'
import { InteractiveRunner } from '../../src/runners/InteractiveRunner'
import { HeadlessRunner } from '../../src/runners/HeadlessRunner'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import { CapabilityMatcher } from '../../src/engine/CapabilityMatcher'
import type { ResolvedColumnData } from '../../src/plugins/types'
import type { DatasetNode, ColumnDefinition } from '../../src/types/dataTypes'
import type { AssumptionViolation, RunProgress } from '../../src/runners/IStepRunner'

// Import plugins to register
import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/CrosstabPlugin'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/PostHocPlugin'

// ============================================================
// Helpers
// ============================================================

function makeCol(id: string, name: string, type: ColumnDefinition['type'], values: (number | string | null)[]): ColumnDefinition {
  return {
    id, name, type,
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    rawValues: values, fingerprint: null, semanticDetectionCache: null,
    transformStack: [], sensitivity: 'anonymous', declaredScaleRange: null,
  }
}

const baseConfig = {
  userId: 'anonymous',
  dataFingerprint: 'test_fp_abc123',
  dataVersion: 1,
  sessionId: 'test_session',
}

const ratingValues = Array.from({ length: 40 }, (_, i) => (i % 5) + 1)
const segmentValues = Array.from({ length: 40 }, (_, i) => i < 20 ? 'A' : 'B')

const testData: ResolvedColumnData = {
  columns: [
    { id: 'q1', name: 'Quality', values: ratingValues },
    { id: 'q2', name: 'Service', values: ratingValues.map((v) => Math.min(5, v + (v % 2))) },
  ],
  segment: { id: 'seg', name: 'Segment', values: segmentValues },
  n: 40,
}

// ============================================================
// InteractiveRunner
// ============================================================

describe('InteractiveRunner', () => {
  it('runs a single plugin', async () => {
    const runner = new InteractiveRunner({ data: testData, ...baseConfig })
    const plugin = AnalysisRegistry.get('frequency')!

    const result = await runner.runOne(plugin)

    expect(result.pluginId).toBe('frequency')
    expect(result.charts.length).toBeGreaterThan(0)
    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.logEntry.userId).toBe('anonymous')
    expect(result.logEntry.dataFingerprint).toBe('test_fp_abc123')
    expect(result.logEntry.dataVersion).toBe(1)
  })

  it('runAll executes plugins in sequence', async () => {
    const runner = new InteractiveRunner({ data: testData, ...baseConfig })

    const node: DatasetNode = {
      id: 'n1', label: 'Test',
      parsedData: {
        groups: [{
          questionType: 'rating',
          columns: [
            makeCol('q1', 'Quality', 'rating', ratingValues),
            makeCol('q2', 'Service', 'rating', ratingValues),
          ],
          label: 'Test',
        }],
        segments: makeCol('seg', 'Segment', 'category', segmentValues),
      },
      rowCount: 40, weights: null, readonly: false, source: 'user', dataVersion: 1, createdAt: Date.now(),
    }

    const caps = CapabilityMatcher.resolve(node)
    const plugins = AnalysisRegistry.queryOrdered(caps)

    const result = await runner.runAll(plugins)

    expect(result.completedPlugins.length).toBeGreaterThan(0)
    expect(result.stepResults.length).toBe(result.completedPlugins.length)
    expect(result.durationMs).toBeGreaterThan(0)
  })

  it('reports progress', async () => {
    const runner = new InteractiveRunner({ data: testData, ...baseConfig })
    const progressUpdates: RunProgress[] = []
    runner.onProgress = (p) => progressUpdates.push(p)

    const plugins = [AnalysisRegistry.get('frequency')!, AnalysisRegistry.get('crosstab')!]
    await runner.runAll(plugins)

    expect(progressUpdates.length).toBe(2)
    expect(progressUpdates[0].current).toBe(1)
    expect(progressUpdates[0].total).toBe(2)
    expect(progressUpdates[1].current).toBe(2)
  })

  it('surfaces assumption violations without blocking', async () => {
    // Small data to trigger minGroupSize violation
    const smallData: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: [1, 2, 3] }],
      segment: { id: 'seg', name: 'Seg', values: ['A', 'A', 'B'] },
      n: 3,
    }

    const runner = new InteractiveRunner({ data: smallData, ...baseConfig })
    const violations: AssumptionViolation[] = []
    runner.onViolation = (v) => violations.push(v)

    const plugin = AnalysisRegistry.get('kw_significance')!
    const result = await runner.runOne(plugin)

    // Plugin should still run — violations are surfaced, not blocking
    expect(result.pluginId).toBe('kw_significance')
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0].check.passed).toBe(false)
  })
})

// ============================================================
// HeadlessRunner
// ============================================================

describe('HeadlessRunner', () => {
  it('runs all plugins without stopping', async () => {
    const runner = new HeadlessRunner({ data: testData, ...baseConfig })

    const plugins = [
      AnalysisRegistry.get('frequency')!,
      AnalysisRegistry.get('crosstab')!,
    ]

    const result = await runner.runAll(plugins)

    expect(result.completedPlugins).toContain('frequency')
    expect(result.completedPlugins).toContain('crosstab')
    expect(result.stepResults.length).toBe(2)
    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.durationMs).toBeGreaterThan(0)
  })

  it('logs assumption violations — never silent', async () => {
    const smallData: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Q1', values: [1, 2, 3] }],
      segment: { id: 'seg', name: 'Seg', values: ['A', 'A', 'B'] },
      n: 3,
    }

    const runner = new HeadlessRunner({ data: smallData, ...baseConfig })
    const violations: AssumptionViolation[] = []
    runner.onViolation = (v) => violations.push(v)

    const plugin = AnalysisRegistry.get('kw_significance')!
    await runner.runOne(plugin)

    // Violation must be logged
    expect(violations.length).toBeGreaterThan(0)
    expect(runner.logEntries.some((e) => e.type === 'assumption_violation')).toBe(true)
  })

  it('flags findings when preconditions violated', async () => {
    const smallData: ResolvedColumnData = {
      columns: [
        { id: 'q1', name: 'Q1', values: [1, 1, 1, 9, 9, 9] },
      ],
      segment: { id: 'seg', name: 'Seg', values: ['A', 'A', 'A', 'B', 'B', 'B'] },
      n: 6,
    }

    const runner = new HeadlessRunner({ data: smallData, ...baseConfig })
    const result = await runner.runOne(AnalysisRegistry.get('kw_significance')!)

    // Findings should be flagged with violation message
    for (const fi of result.findings) {
      if (result.assumptions.some((a) => !a.passed)) {
        expect(fi.detail).toContain('ASSUMPTION VIOLATION')
      }
    }
  })

  it('continues past plugin errors', async () => {
    // Create a plugin that will throw
    const failPlugin = {
      ...AnalysisRegistry.get('frequency')!,
      id: 'fail_test',
      run: async () => { throw new Error('Intentional failure') },
    }

    const runner = new HeadlessRunner({ data: testData, ...baseConfig })
    const result = await runner.runAll([
      failPlugin as any,
      AnalysisRegistry.get('frequency')!,
    ])

    expect(result.skippedPlugins).toContain('fail_test')
    expect(result.completedPlugins).toContain('frequency')
    // Failure must be logged
    expect(runner.logEntries.some((e) => e.type === 'analysis_failed')).toBe(true)
  })

  it('accumulates log entries for all steps', async () => {
    const runner = new HeadlessRunner({ data: testData, ...baseConfig })

    await runner.runAll([
      AnalysisRegistry.get('frequency')!,
      AnalysisRegistry.get('crosstab')!,
    ])

    // Should have log entries for each plugin run
    expect(runner.logEntries.length).toBeGreaterThanOrEqual(2)
    expect(runner.logEntries.every((e) => e.userId === 'anonymous')).toBe(true)
    expect(runner.logEntries.every((e) => e.dataFingerprint === 'test_fp_abc123')).toBe(true)
  })

  it('generates findings with dataVersion and dataFingerprint', async () => {
    const runner = new HeadlessRunner({ data: testData, ...baseConfig })

    const result = await runner.runAll([AnalysisRegistry.get('frequency')!])

    for (const finding of result.findings) {
      expect(finding.dataVersion).toBe(1)
      expect(finding.dataFingerprint).toBe('test_fp_abc123')
    }
  })

  it('reports progress', async () => {
    const runner = new HeadlessRunner({ data: testData, ...baseConfig })
    const updates: RunProgress[] = []
    runner.onProgress = (p) => updates.push(p)

    await runner.runAll([
      AnalysisRegistry.get('frequency')!,
      AnalysisRegistry.get('crosstab')!,
    ])

    expect(updates.length).toBe(2)
    expect(updates[0].pluginId).toBe('frequency')
    expect(updates[1].pluginId).toBe('crosstab')
  })
})
