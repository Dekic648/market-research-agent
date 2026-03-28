/**
 * Session persistence tests.
 *
 * Tests serialization/rehydration logic (not actual IndexedDB — that
 * requires a browser environment). Tests the .mrst file format logic.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { serializeStores, rehydrateAllStores } from '../../src/stores/persistence'
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

describe('serializeStores', () => {
  it('produces valid JSON with no functions', () => {
    const serialized = serializeStores()
    const json = JSON.stringify(serialized)
    expect(() => JSON.parse(json)).not.toThrow()

    // No function values in the output
    const walk = (obj: any) => {
      for (const key of Object.keys(obj)) {
        expect(typeof obj[key]).not.toBe('function')
        if (typeof obj[key] === 'object' && obj[key] !== null) walk(obj[key])
      }
    }
    walk(JSON.parse(json))
  })

  it('includes data from all 5 stores', () => {
    // Add data to each store
    useDatasetGraphStore.getState().addNode({
      id: 'n1', label: 'Test', parsedData: { groups: [] },
      rowCount: 0, weights: null, readonly: false, source: 'user', dataVersion: 1, createdAt: Date.now(),
    })
    useSessionStore.getState().setActiveDatasetNode('n1')
    useChartStore.getState().addChart({
      id: 'c1', type: 'horizontalBar', data: [], layout: {}, config: {}, stepId: 's1', edits: {},
    })
    useFindingsStore.getState().add({
      id: 'f1', stepId: 's1', type: 'test', title: 'T', summary: 'S', detail: 'D',
      significant: false, pValue: null, adjustedPValue: null, effectSize: null,
      effectLabel: null, theme: null, suppressed: false, priority: 0,
      createdAt: Date.now(), dataVersion: 1, dataFingerprint: 'fp',
    })
    useAnalysisLog.getState().log({
      type: 'analysis_run', userId: 'anonymous', dataFingerprint: 'fp',
      dataVersion: 1, sessionId: 's1',
    })

    const serialized = serializeStores() as any
    expect(serialized.datasetGraph.nodes).toHaveLength(1)
    expect(serialized.session.activeDatasetNodeId).toBe('n1')
    expect(serialized.chart.configs.c1).toBeDefined()
    expect(serialized.findings.findings).toHaveLength(1)
    expect(serialized.log.entries).toHaveLength(1)
  })
})

describe('rehydrateAllStores', () => {
  it('restores all stores from serialized state', () => {
    // Populate stores
    useDatasetGraphStore.getState().addNode({
      id: 'n1', label: 'Test', parsedData: { groups: [] },
      rowCount: 0, weights: null, readonly: false, source: 'user', dataVersion: 1, createdAt: Date.now(),
    })
    useSessionStore.getState().setActiveDatasetNode('n1')
    useFindingsStore.getState().add({
      id: 'f1', stepId: 's1', type: 'test', title: 'T', summary: 'S', detail: 'D',
      significant: true, pValue: 0.01, adjustedPValue: null, effectSize: 0.5,
      effectLabel: 'medium', theme: null, suppressed: false, priority: 0,
      createdAt: Date.now(), dataVersion: 1, dataFingerprint: 'fp',
    })
    useAnalysisLog.getState().log({
      type: 'analysis_run', userId: 'user1', dataFingerprint: 'fp',
      dataVersion: 1, sessionId: 's1',
    })

    // Serialize
    const snapshot = serializeStores()

    // Reset all stores
    useDatasetGraphStore.getState().reset()
    useSessionStore.getState().reset()
    useFindingsStore.getState().reset()
    useAnalysisLog.getState().reset()

    // Verify reset
    expect(useDatasetGraphStore.getState().nodes).toHaveLength(0)
    expect(useFindingsStore.getState().findings).toHaveLength(0)

    // Rehydrate
    rehydrateAllStores(snapshot)

    // Verify restored
    expect(useDatasetGraphStore.getState().nodes).toHaveLength(1)
    expect(useDatasetGraphStore.getState().nodes[0].id).toBe('n1')
    expect(useSessionStore.getState().activeDatasetNodeId).toBe('n1')
    expect(useFindingsStore.getState().findings).toHaveLength(1)
    expect(useFindingsStore.getState().findings[0].pValue).toBe(0.01)
    expect(useAnalysisLog.getState().entries).toHaveLength(1)
    expect(useAnalysisLog.getState().entries[0].userId).toBe('user1')
  })

  it('handles empty serialized state gracefully', () => {
    expect(() => rehydrateAllStores({})).not.toThrow()
  })
})

describe('round-trip: serialize → reset → rehydrate', () => {
  it('preserves chart configs', () => {
    useChartStore.getState().addChart({
      id: 'c1', type: 'heatmap', data: [{ z: [[1, 2], [3, 4]] }],
      layout: { title: { text: 'Test' } }, config: { responsive: true },
      stepId: 's1', edits: { title: 'Custom' },
    })

    const snapshot = serializeStores()
    useChartStore.getState().reset()
    rehydrateAllStores(snapshot)

    const configs = useChartStore.getState().configs
    expect(configs.c1).toBeDefined()
    expect(configs.c1.type).toBe('heatmap')
    expect(configs.c1.edits.title).toBe('Custom')
  })
})
