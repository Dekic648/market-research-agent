/**
 * Session persistence — IndexedDB via idb package.
 *
 * Three object stores:
 *   'sessions'    key: 'current'   — all store state except rawValues
 *   'columnData'  key: columnId    — rawValues[] per column (stored separately)
 *   'analysisLog' key: entryId     — AnalysisLogEntry
 *
 * Auto-save: subscribe to datasetGraph, debounce 2000ms.
 * Auto-restore: check IndexedDB on app load before rendering empty state.
 */

import { openDB, type IDBPDatabase } from 'idb'
import { useDatasetGraphStore } from './datasetGraph'
import { useSessionStore } from './sessionStore'
import { useChartStore } from './chartStore'
import { useFindingsStore } from './findingsStore'
import { useAnalysisLog } from './analysisLog'

const DB_NAME = 'mrst'
const DB_VERSION = 1

// ============================================================
// Database setup
// ============================================================

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions')
        }
        if (!db.objectStoreNames.contains('columnData')) {
          db.createObjectStore('columnData')
        }
        if (!db.objectStoreNames.contains('analysisLog')) {
          db.createObjectStore('analysisLog')
        }
      },
    })
  }
  return dbPromise
}

// ============================================================
// Serialization helpers
// ============================================================

interface SerializedStores {
  datasetGraph: ReturnType<typeof useDatasetGraphStore.getState>
  session: ReturnType<typeof useSessionStore.getState>
  chart: ReturnType<typeof useChartStore.getState>
  findings: ReturnType<typeof useFindingsStore.getState>
  log: ReturnType<typeof useAnalysisLog.getState>
}

/**
 * Serialize all stores to a plain object, stripping functions.
 * rawValues are excluded — stored separately in 'columnData'.
 */
export function serializeStores(): Record<string, unknown> {
  const state: SerializedStores = {
    datasetGraph: useDatasetGraphStore.getState(),
    session: useSessionStore.getState(),
    chart: useChartStore.getState(),
    findings: useFindingsStore.getState(),
    log: useAnalysisLog.getState(),
  }

  return JSON.parse(
    JSON.stringify(state, (_key, value) =>
      typeof value === 'function' ? undefined : value
    )
  )
}

/**
 * Rehydrate all stores from a serialized state object.
 */
export function rehydrateAllStores(serialized: Record<string, unknown>): void {
  const s = serialized as any

  if (s.datasetGraph) {
    const { nodes, edges } = s.datasetGraph
    useDatasetGraphStore.getState().reset()
    if (nodes) for (const n of nodes) useDatasetGraphStore.getState().addNode(n)
    if (edges) for (const e of edges) useDatasetGraphStore.getState().addEdge(e)
  }

  if (s.session) {
    const store = useSessionStore.getState()
    store.reset()
    if (s.session.sessionId) store.setSessionId(s.session.sessionId)
    if (s.session.activeDatasetNodeId) store.setActiveDatasetNode(s.session.activeDatasetNodeId)
    if (s.session.currentFlowIndex) store.setFlowIndex(s.session.currentFlowIndex)
    if (s.session.stepResults) {
      for (const r of s.session.stepResults) store.addStepResult(r)
    }
  }

  if (s.chart?.configs) {
    useChartStore.getState().reset()
    for (const config of Object.values(s.chart.configs)) {
      useChartStore.getState().addChart(config as any)
    }
  }

  if (s.findings?.findings) {
    useFindingsStore.getState().reset()
    for (const f of s.findings.findings) {
      useFindingsStore.getState().add(f)
    }
  }

  if (s.log?.entries) {
    useAnalysisLog.getState().reset()
    for (const e of s.log.entries) {
      useAnalysisLog.getState().append(e)
    }
  }
}

// ============================================================
// IndexedDB save/restore
// ============================================================

/**
 * Save current state to IndexedDB.
 */
export async function saveToIndexedDB(): Promise<void> {
  const db = await getDB()
  const serialized = serializeStores()

  // Save main state (without rawValues)
  await db.put('sessions', serialized, 'current')

  // Save rawValues separately per column
  const nodes = useDatasetGraphStore.getState().nodes
  for (const node of nodes) {
    for (const group of node.parsedData.groups) {
      for (const col of group.columns) {
        await db.put('columnData', col.rawValues, col.id)
      }
    }
  }

  // Save log entries individually
  const entries = useAnalysisLog.getState().entries
  for (const entry of entries) {
    await db.put('analysisLog', entry, entry.id)
  }
}

/**
 * Restore state from IndexedDB. Returns true if state was found.
 */
export async function restoreFromIndexedDB(): Promise<boolean> {
  const db = await getDB()
  const saved = await db.get('sessions', 'current')

  if (!saved) return false

  rehydrateAllStores(saved as Record<string, unknown>)
  return true
}

/**
 * Clear all IndexedDB data.
 */
export async function clearIndexedDB(): Promise<void> {
  const db = await getDB()
  await db.clear('sessions')
  await db.clear('columnData')
  await db.clear('analysisLog')
}

// ============================================================
// Auto-save (debounced)
// ============================================================

let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Start auto-save subscription. Call once on app init.
 * Debounces saves by 2000ms.
 */
export function startAutoSave(): () => void {
  const unsubscribe = useDatasetGraphStore.subscribe(() => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveToIndexedDB().catch(console.error)
    }, 2000)
  })

  return () => {
    unsubscribe()
    if (saveTimer) clearTimeout(saveTimer)
  }
}
