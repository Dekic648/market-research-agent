/**
 * Cross-slice selectors — the ONLY place stores read from each other.
 * No store imports another store directly.
 */
import { useDatasetGraphStore } from './datasetGraph'
import { useSessionStore } from './sessionStore'
import { useChartStore } from './chartStore'
import { useFindingsStore } from './findingsStore'
import { useAnalysisLog } from './analysisLog'
import type { DatasetNode, Finding, ChartConfig } from '../types/dataTypes'

/** Get the currently active dataset node */
export function useActiveDatasetNode(): DatasetNode | null {
  const activeId = useSessionStore((s) => s.activeDatasetNodeId)
  const nodes = useDatasetGraphStore((s) => s.nodes)
  if (!activeId) return null
  return nodes.find((n) => n.id === activeId) ?? null
}

/** Get visible (non-suppressed) findings sorted by priority */
export function useVisibleFindings(): Finding[] {
  const findings = useFindingsStore((s) => s.findings)
  return findings
    .filter((f) => !f.suppressed)
    .sort((a, b) => a.priority - b.priority)
}

/** Get charts for a specific step */
export function useChartsForStep(stepId: string): ChartConfig[] {
  const configs = useChartStore((s) => s.configs)
  return Object.values(configs).filter((c) => c.stepId === stepId)
}

/** Get the latest data version from the active node */
export function useActiveDataVersion(): number {
  const node = useActiveDatasetNode()
  return node?.dataVersion ?? 0
}

/** Get all log entries for the current session */
export function useCurrentSessionLog() {
  const sessionId = useSessionStore((s) => s.sessionId)
  const entries = useAnalysisLog((s) => s.entries)
  return entries.filter((e) => e.sessionId === sessionId)
}

/**
 * Non-hook versions for use outside React components
 * (e.g., in runners, plugins, or store actions that need cross-slice reads)
 */
export const selectors = {
  getActiveDatasetNode(): DatasetNode | null {
    const activeId = useSessionStore.getState().activeDatasetNodeId
    const nodes = useDatasetGraphStore.getState().nodes
    if (!activeId) return null
    return nodes.find((n) => n.id === activeId) ?? null
  },

  getVisibleFindings(): Finding[] {
    return useFindingsStore
      .getState()
      .findings.filter((f) => !f.suppressed)
      .sort((a, b) => a.priority - b.priority)
  },

  getActiveDataVersion(): number {
    const node = selectors.getActiveDatasetNode()
    return node?.dataVersion ?? 0
  },

  getChartsForStep(stepId: string): ChartConfig[] {
    const configs = useChartStore.getState().configs
    return Object.values(configs).filter((c) => c.stepId === stepId)
  },
}
