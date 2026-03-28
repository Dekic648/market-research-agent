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
  SubgroupFilter,
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
  reorderTransforms: (nodeId: string, columnId: string, orderedIds: string[]) => void
  snapshotStack: (nodeId: string, columnId: string) => Transform[]

  // Imputation operations
  applyImputation: (nodeId: string, imputedColumns: Map<string, (number | string | null)[]>) => void

  // Weight operations
  setComputedWeights: (nodeId: string, weights: number[], label: string) => void

  // Subgroup operations
  setSubgroup: (nodeId: string, filter: SubgroupFilter) => void
  clearSubgroup: (nodeId: string) => void

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

export const useDatasetGraphStore = create<DatasetGraphState>()((set, get) => ({
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

  reorderTransforms: (nodeId, columnId, orderedIds) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? updateColumnInNode(n, columnId, (col) => {
              const byId = new Map(col.transformStack.map((t) => [t.id, t]))
              const reordered = orderedIds
                .map((id) => byId.get(id))
                .filter((t): t is Transform => t !== undefined)
              return { ...col, transformStack: reordered }
            })
          : n
      ),
    })),

  snapshotStack: (nodeId, columnId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node) return []
    for (const group of node.parsedData.groups) {
      const col = group.columns.find((c) => c.id === columnId)
      if (col) return col.transformStack.map((t) => ({ ...t }))
    }
    return []
  },

  applyImputation: (nodeId, imputedColumns) =>
    set((s) => ({
      nodes: s.nodes.map((node) => {
        if (node.id !== nodeId) return node
        const updatedGroups = node.parsedData.groups.map((group) => ({
          ...group,
          columns: group.columns.map((col) => {
            const imputed = imputedColumns.get(col.id)
            return imputed ? { ...col, imputedValues: imputed } : col
          }),
        }))
        return {
          ...node,
          parsedData: { ...node.parsedData, groups: updatedGroups },
          dataVersion: node.dataVersion + 1,
        }
      }),
    })),

  setComputedWeights: (nodeId, weights, label) =>
    set((s) => ({
      nodes: s.nodes.map((node) => {
        if (node.id !== nodeId) return node
        const syntheticCol: ColumnDefinition = {
          id: `computed_weight_${nodeId}`,
          name: label,
          type: 'weight',
          nRows: weights.length,
          nMissing: 0,
          nullMeaning: 'missing',
          rawValues: weights,
          fingerprint: null,
          semanticDetectionCache: null,
          transformStack: [],
          sensitivity: 'anonymous',
          declaredScaleRange: null,
        }
        return { ...node, weights: syntheticCol, dataVersion: node.dataVersion + 1 }
      }),
    })),

  setSubgroup: (nodeId, filter) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, activeSubgroup: filter } : n
      ),
    })),

  clearSubgroup: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, activeSubgroup: null } : n
      ),
    })),

  reset: () => set(initialState),
}))
