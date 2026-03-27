/**
 * ChartStore — holds chart configs only, no raw data.
 * Data comes from SessionStore.stepResults at render time.
 */
import { create } from 'zustand'
import type { ChartConfig, ChartEdits } from '../types/dataTypes'

interface ChartStoreState {
  configs: Record<string, ChartConfig>

  addChart: (config: ChartConfig) => void
  updateEdits: (chartId: string, edits: Partial<ChartEdits>) => void
  removeChart: (chartId: string) => void
  reset: () => void
}

const initialState = {
  configs: {} as Record<string, ChartConfig>,
}

export const useChartStore = create<ChartStoreState>()((set) => ({
  ...initialState,

  addChart: (config) =>
    set((s) => ({
      configs: { ...s.configs, [config.id]: config },
    })),

  updateEdits: (chartId, edits) =>
    set((s) => {
      const existing = s.configs[chartId]
      if (!existing) return s
      return {
        configs: {
          ...s.configs,
          [chartId]: {
            ...existing,
            edits: { ...existing.edits, ...edits },
          },
        },
      }
    }),

  removeChart: (chartId) =>
    set((s) => {
      const { [chartId]: _, ...rest } = s.configs
      return { configs: rest }
    }),

  reset: () => set(initialState),
}))
