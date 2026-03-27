/**
 * DatasetGraph store — replaces the single DataStore.
 * Nodes = datasets, edges = relationships between them.
 */
import { create } from 'zustand'
import type {
  DatasetNode,
  DatasetEdge,
  PastedData,
  ColumnDefinition,
  Transform,
} from '../types/dataTypes'

interface DatasetGraphState {
  nodes: DatasetNode[]
  edges: DatasetEdge[]

  // Node operations
  addNode: (node: DatasetNode) => void
  updateNode: (nodeId: string, patch: Partial<DatasetNode>) => void
  removeNode: (nodeId: string) => void
  incrementDataVersion: (nodeId: string) => void

  // Edge operations
  addEdge: (edge: DatasetEdge) => void
  removeEdge: (edgeId: string) => void

  // Transform operations on columns within a node
  addTransform: (nodeId: string, columnId: string, transform: Transform) => void
  removeTransform: (nodeId: string, columnId: string, transformId: string) => void
  toggleTransform: (nodeId: string, columnId: string, transformId: string) => void

  // Bulk reset
  reset: () => void
}

const initialState = {
  nodes: [] as DatasetNode[],
  edges: [] as DatasetEdge[],
}

function updateColumnInNode(
  node: DatasetNode,
  columnId: string,
  updater: (col: ColumnDefinition) => ColumnDefinition
): DatasetNode {
  const updatedGroups = node.parsedData.groups.map(group => ({
    ...group,
    columns: group.columns.map(col =>
      col.id === columnId ? updater(col) : col
    ),
  }))
  return {
    ...node,
    parsedData: { ...node.parsedData, groups: updatedGroups },
  }
}

export const useDatasetGraphStore = create<DatasetGraphState>()((set) => ({
  ...initialState,

  addNode: (node) =>
    set((s) => ({ nodes: [...s.nodes, node] })),

  updateNode: (nodeId, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    })),

  removeNode: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter(
        (e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId
      ),
    })),

  incrementDataVersion: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, dataVersion: n.dataVersion + 1 } : n
      ),
    })),

  addEdge: (edge) =>
    set((s) => ({ edges: [...s.edges, edge] })),

  removeEdge: (edgeId) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== edgeId) })),

  addTransform: (nodeId, columnId, transform) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? updateColumnInNode(n, columnId, (col) => ({
              ...col,
              transformStack: [...col.transformStack, transform],
            }))
          : n
      ),
    })),

  removeTransform: (nodeId, columnId, transformId) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? updateColumnInNode(n, columnId, (col) => ({
              ...col,
              transformStack: col.transformStack.filter(
                (t) => t.id !== transformId
              ),
            }))
          : n
      ),
    })),

  toggleTransform: (nodeId, columnId, transformId) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? updateColumnInNode(n, columnId, (col) => ({
              ...col,
              transformStack: col.transformStack.map((t) =>
                t.id === transformId ? { ...t, enabled: !t.enabled } : t
              ),
            }))
          : n
      ),
    })),

  reset: () => set(initialState),
}))
