/**
 * ExplorerPanel logic tests — plugin availability, pinning, row filter.
 *
 * Tests core logic without React rendering. Component-level rendering
 * tests would require jsdom — these validate the underlying behavior.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import { CapabilityMatcher } from '../../src/engine/CapabilityMatcher'
import { useSelectionStore } from '../../src/stores/selectionStore'
import { useFindingsStore } from '../../src/stores/findingsStore'
import { applyRowFilter } from '../../src/engine/rowFilter'
import type { ColumnDefinition, Finding } from '../../src/types/dataTypes'

// Import plugins to trigger registration
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
    id, name, type,
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    rawValues: values,
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: [],
    sensitivity: 'anonymous',
    declaredScaleRange: null,
  }
}

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: 'f1', stepId: 'frequency', type: 'frequency',
    title: 'Test', summary: 'Test', detail: '{}',
    significant: false, pValue: null, adjustedPValue: null,
    effectSize: null, effectLabel: null, theme: null,
    suppressed: false, priority: 0, createdAt: Date.now(),
    dataVersion: 1, dataFingerprint: 'fp',
    ...overrides,
  }
}

beforeEach(() => {
  useSelectionStore.getState().reset()
  useFindingsStore.getState().reset()
})

describe('Plugin availability based on capabilities', () => {
  it('plugins are disabled when capabilities do not match requires', () => {
    // Select only a categorical column — no ordinal capability
    const col = makeCol('q1', 'Color', 'category', ['Red', 'Blue', 'Green'])
    useSelectionStore.getState().addColumn(col)

    const caps = useSelectionStore.getState().getSelectionCapabilities()
    const available = AnalysisRegistry.query(caps)

    // FrequencyPlugin requires 'ordinal' — should NOT be available
    expect(available.some((p) => p.id === 'frequency')).toBe(false)
  })

  it('plugins show correct unavailability reason — needs segment', () => {
    // Rating column but no segment → SignificancePlugin unavailable
    const col = makeCol('q1', 'Score', 'rating', Array.from({ length: 40 }, (_, i) => (i % 5) + 1))
    useSelectionStore.getState().addColumn(col)

    const caps = useSelectionStore.getState().getSelectionCapabilities()

    // SignificancePlugin requires segment
    const sigPlugin = AnalysisRegistry.get('kw_significance')
    expect(sigPlugin).toBeDefined()

    const missing = sigPlugin!.requires.filter((r) => !caps.has(r))
    expect(missing).toContain('segment')
  })

  it('frequency plugin available for rating column', () => {
    const col = makeCol('q1', 'Score', 'rating', Array.from({ length: 40 }, (_, i) => (i % 5) + 1))
    useSelectionStore.getState().addColumn(col)

    const caps = useSelectionStore.getState().getSelectionCapabilities()
    const available = AnalysisRegistry.query(caps)

    expect(available.some((p) => p.id === 'frequency')).toBe(true)
  })
})

describe('Pin to report', () => {
  it('FindingsStore.add() creates the finding correctly', () => {
    const finding = makeFinding({
      id: 'explorer_freq_1',
      stepId: 'frequency',
      title: 'Satisfaction Distribution',
    })

    useFindingsStore.getState().add(finding)

    const findings = useFindingsStore.getState().findings
    expect(findings).toHaveLength(1)
    expect(findings[0].id).toBe('explorer_freq_1')
    expect(findings[0].title).toBe('Satisfaction Distribution')
  })

  it('pinned finding appears in getOrderedForReport', () => {
    const finding = makeFinding({
      id: 'explorer_freq_1',
      stepId: 'frequency',
      title: 'Pinned Finding',
    })

    useFindingsStore.getState().add(finding)
    const ordered = useFindingsStore.getState().getOrderedForReport()
    expect(ordered.some((f) => f.id === 'explorer_freq_1')).toBe(true)
  })
})

describe('Row filter reduces count', () => {
  it('filter reduces the row count', () => {
    const col = makeCol('q1', 'Score', 'rating', [1, 2, 3, 4, 5, 1, 2, 3, 4, 5])

    const allIndices = applyRowFilter([col], null)
    expect(allIndices).toHaveLength(10)

    const filteredIndices = applyRowFilter([col], { columnId: 'q1', operator: 'greater_than', value: '3' })
    expect(filteredIndices).toHaveLength(4)
    expect(filteredIndices).toEqual([3, 4, 8, 9])
  })
})
