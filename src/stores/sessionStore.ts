/**
 * SessionStore — tracks the current analysis flow state.
 */
import { create } from 'zustand'
import type { StepResult } from '../types/dataTypes'

interface SessionStoreState {
  sessionId: string
  currentFlowIndex: number
  stepResults: StepResult[]
  activeDatasetNodeId: string | null

  setSessionId: (id: string) => void
  setActiveDatasetNode: (nodeId: string | null) => void
  advanceFlow: () => void
  setFlowIndex: (index: number) => void
  addStepResult: (result: StepResult) => void
  reset: () => void
}

function generateSessionId(): string {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

const initialState = {
  sessionId: generateSessionId(),
  currentFlowIndex: 0,
  stepResults: [] as StepResult[],
  activeDatasetNodeId: null as string | null,
}

export const useSessionStore = create<SessionStoreState>()((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),

  setActiveDatasetNode: (nodeId) => set({ activeDatasetNodeId: nodeId }),

  advanceFlow: () =>
    set((s) => ({ currentFlowIndex: s.currentFlowIndex + 1 })),

  setFlowIndex: (index) => set({ currentFlowIndex: index }),

  addStepResult: (result) =>
    set((s) => ({ stepResults: [...s.stepResults, result] })),

  reset: () => set({ ...initialState, sessionId: generateSessionId() }),
}))
