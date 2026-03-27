/**
 * Store serialization test — the governance contract.
 * This test MUST always pass. It is the prerequisite for:
 * - IndexedDB persistence
 * - Session file export (.mrst)
 * - Eventual Supabase sync
 *
 * If this test fails, a store contains DOM nodes, function values,
 * or circular references — and session persistence is broken.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useDatasetGraphStore } from '../../src/stores/datasetGraph'
import { useSessionStore } from '../../src/stores/sessionStore'
import { useChartStore } from '../../src/stores/chartStore'
import { useFindingsStore } from '../../src/stores/findingsStore'
import { useAnalysisLog } from '../../src/stores/analysisLog'

beforeEach(() => {
  useDatasetGraphStore.getState().reset()
  useSessionStore.getState().reset()
  useChartStore.getState().reset()
  useFindingsStore.getState().reset()
  useAnalysisLog.getState().reset()
})

describe('Store serialization contract', () => {
  it('all stores are JSON-serializable when empty', () => {
    const state = {
      datasetGraph: useDatasetGraphStore.getState(),
      session: useSessionStore.getState(),
      chart: useChartStore.getState(),
      findings: useFindingsStore.getState(),
      log: useAnalysisLog.getState(),
    }

    // Strip functions before serialization (Zustand stores include action methods)
    const serializable = JSON.parse(
      JSON.stringify(state, (_key, value) =>
        typeof value === 'function' ? undefined : value
      )
    )

    expect(serializable).toBeDefined()
    expect(serializable.datasetGraph.nodes).toEqual([])
    expect(serializable.datasetGraph.edges).toEqual([])
    expect(serializable.session.stepResults).toEqual([])
    expect(serializable.chart.configs).toEqual({})
    expect(serializable.findings.findings).toEqual([])
    expect(serializable.log.entries).toEqual([])
  })

  it('all stores are JSON-serializable with data', () => {
    // Add data to each store
    useDatasetGraphStore.getState().addNode({
      id: 'node1',
      label: 'Test Dataset',
      parsedData: {
        groups: [
          {
            questionType: 'rating',
            columns: [
              {
                id: 'col1',
                name: 'Q1',
                type: 'rating',
                nRows: 5,
                nMissing: 0,
                rawValues: [1, 2, 3, 4, 5],
                fingerprint: null,
                semanticDetectionCache: null,
                transformStack: [],
                sensitivity: 'anonymous',
                declaredScaleRange: [1, 5],
              },
            ],
            label: 'Satisfaction',
            scaleRange: [1, 5],
          },
        ],
      },
      weights: null,
      readonly: false,
      source: 'user',
      dataVersion: 1,
      createdAt: Date.now(),
    })

    useSessionStore.getState().addStepResult({
      stepId: 'step1',
      pluginId: 'frequency',
      result: { counts: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 } },
      timestamp: Date.now(),
      dataVersion: 1,
      dataFingerprint: 'abc123',
    })

    useChartStore.getState().addChart({
      id: 'chart1',
      type: 'horizontalBar',
      data: [{ x: [1, 2, 3], y: ['A', 'B', 'C'], type: 'bar' }],
      layout: { title: 'Test' },
      config: { responsive: true },
      stepId: 'step1',
      edits: { title: 'Custom Title' },
    })

    useFindingsStore.getState().add({
      id: 'finding1',
      stepId: 'step1',
      type: 'frequency',
      title: 'Distribution',
      summary: 'Q1 has uniform distribution',
      detail: 'All values equally represented',
      significant: false,
      pValue: null,
      adjustedPValue: null,
      effectSize: null,
      effectLabel: null,
      theme: null,
      suppressed: false,
      priority: 0,
      createdAt: Date.now(),
      dataVersion: 1,
      dataFingerprint: 'abc123',
    })

    useAnalysisLog.getState().log({
      type: 'analysis_run',
      userId: 'anonymous',
      dataFingerprint: 'abc123',
      dataVersion: 1,
      sessionId: 'test_session',
      payload: { pluginId: 'frequency' },
    })

    // The critical test: serialize and deserialize all stores
    const state = {
      datasetGraph: useDatasetGraphStore.getState(),
      session: useSessionStore.getState(),
      chart: useChartStore.getState(),
      findings: useFindingsStore.getState(),
      log: useAnalysisLog.getState(),
    }

    const json = JSON.stringify(state, (_key, value) =>
      typeof value === 'function' ? undefined : value
    )
    const parsed = JSON.parse(json)

    expect(parsed.datasetGraph.nodes).toHaveLength(1)
    expect(parsed.datasetGraph.nodes[0].id).toBe('node1')
    expect(parsed.session.stepResults).toHaveLength(1)
    expect(parsed.chart.configs.chart1.type).toBe('horizontalBar')
    expect(parsed.findings.findings).toHaveLength(1)
    expect(parsed.log.entries).toHaveLength(1)
    expect(parsed.log.entries[0].userId).toBe('anonymous')
    expect(parsed.log.entries[0].dataFingerprint).toBe('abc123')
    expect(parsed.log.entries[0].dataVersion).toBe(1)
  })
})

describe('AnalysisLog validation', () => {
  it('rejects entries without userId', () => {
    expect(() =>
      useAnalysisLog.getState().append({
        id: 'bad1',
        type: 'analysis_run',
        timestamp: Date.now(),
        userId: '',
        dataFingerprint: 'abc',
        dataVersion: 1,
        sessionId: 's1',
        payload: {},
      })
    ).toThrow('userId')
  })

  it('rejects entries without dataFingerprint', () => {
    expect(() =>
      useAnalysisLog.getState().append({
        id: 'bad2',
        type: 'analysis_run',
        timestamp: Date.now(),
        userId: 'anonymous',
        dataFingerprint: '',
        dataVersion: 1,
        sessionId: 's1',
        payload: {},
      })
    ).toThrow('dataFingerprint')
  })
})

describe('FindingsStore API', () => {
  const makeFinding = (id: string, pValue: number | null = null) => ({
    id,
    stepId: 'step1',
    type: 'test',
    title: `Finding ${id}`,
    summary: '',
    detail: '',
    significant: pValue !== null && pValue < 0.05,
    pValue,
    adjustedPValue: null,
    effectSize: null,
    effectLabel: null,
    theme: null,
    suppressed: false,
    priority: 0,
    createdAt: Date.now(),
    dataVersion: 1,
    dataFingerprint: 'abc',
  })

  it('add() creates findings', () => {
    useFindingsStore.getState().add(makeFinding('f1'))
    useFindingsStore.getState().add(makeFinding('f2'))
    expect(useFindingsStore.getState().findings).toHaveLength(2)
  })

  it('suppress() hides a finding', () => {
    useFindingsStore.getState().add(makeFinding('f1'))
    useFindingsStore.getState().suppress('f1')
    expect(useFindingsStore.getState().findings[0].suppressed).toBe(true)
  })

  it('reorder() moves findings', () => {
    useFindingsStore.getState().add(makeFinding('f1'))
    useFindingsStore.getState().add(makeFinding('f2'))
    useFindingsStore.getState().add(makeFinding('f3'))
    useFindingsStore.getState().reorder('f3', null) // move f3 to front
    const ids = useFindingsStore.getState().findings.map((f) => f.id)
    expect(ids[0]).toBe('f3')
  })

  it('applyFDRCorrection bonferroni adjusts p-values', () => {
    useFindingsStore.getState().add(makeFinding('f1', 0.01))
    useFindingsStore.getState().add(makeFinding('f2', 0.03))
    useFindingsStore.getState().add(makeFinding('f3', 0.04))
    useFindingsStore.getState().applyFDRCorrection('bonferroni')

    const findings = useFindingsStore.getState().findings
    const f1 = findings.find((f) => f.id === 'f1')!
    const f3 = findings.find((f) => f.id === 'f3')!

    expect(f1.adjustedPValue).toBeCloseTo(0.03, 2) // 0.01 * 3
    expect(f3.adjustedPValue).toBeCloseTo(0.12, 2) // 0.04 * 3
  })

  it('applyFDRCorrection bh adjusts p-values', () => {
    useFindingsStore.getState().add(makeFinding('f1', 0.01))
    useFindingsStore.getState().add(makeFinding('f2', 0.03))
    useFindingsStore.getState().add(makeFinding('f3', 0.04))
    useFindingsStore.getState().applyFDRCorrection('bh')

    const findings = useFindingsStore.getState().findings
    const f1 = findings.find((f) => f.id === 'f1')!
    // BH: rank 1, p=0.01 → 0.01*3/1 = 0.03, but min with next = 0.03
    expect(f1.adjustedPValue).toBeCloseTo(0.03, 2)
  })
})
