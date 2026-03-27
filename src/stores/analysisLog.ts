/**
 * AnalysisLog store — immutable, append-only.
 * Every entry MUST have userId, dataFingerprint, and dataVersion.
 * These three fields cannot be added retroactively.
 *
 * RULES:
 * - No splice, no delete, no update — ever
 * - entries array is append-only
 */
import { create } from 'zustand'
import type { AnalysisLogEntry, LogEntryType } from '../types/dataTypes'

interface AnalysisLogState {
  entries: AnalysisLogEntry[]

  /**
   * Append a new entry. Validates that required fields are present.
   * Throws if userId, dataFingerprint, or dataVersion is missing.
   */
  append: (entry: AnalysisLogEntry) => void

  /**
   * Convenience: create and append an entry with auto-generated id and timestamp.
   */
  log: (params: {
    type: LogEntryType
    userId: string
    dataFingerprint: string
    dataVersion: number
    sessionId: string
    payload?: Record<string, unknown>
  }) => void

  /** Get entries filtered by type */
  entriesByType: (type: LogEntryType) => AnalysisLogEntry[]

  /** Get entries for a specific data version */
  entriesByDataVersion: (version: number) => AnalysisLogEntry[]

  /** Reset — only for tests and session reset. Never in production mid-session. */
  reset: () => void
}

const initialState = {
  entries: [] as AnalysisLogEntry[],
}

function generateEntryId(): string {
  return 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

export const useAnalysisLog = create<AnalysisLogState>()((set, get) => ({
  ...initialState,

  append: (entry) => {
    // Validate the three non-negotiable fields
    if (!entry.userId) {
      throw new Error('AnalysisLogEntry.userId is required and cannot be empty')
    }
    if (!entry.dataFingerprint) {
      throw new Error('AnalysisLogEntry.dataFingerprint is required and cannot be empty')
    }
    if (entry.dataVersion === undefined || entry.dataVersion === null) {
      throw new Error('AnalysisLogEntry.dataVersion is required')
    }

    // Append-only — no mutation of existing entries
    set((s) => ({ entries: [...s.entries, entry] }))
  },

  log: ({ type, userId, dataFingerprint, dataVersion, sessionId, payload }) => {
    const entry: AnalysisLogEntry = {
      id: generateEntryId(),
      type,
      timestamp: Date.now(),
      userId,
      dataFingerprint,
      dataVersion,
      sessionId,
      payload: payload ?? {},
    }
    get().append(entry)
  },

  entriesByType: (type) => {
    return get().entries.filter((e) => e.type === type)
  },

  entriesByDataVersion: (version) => {
    return get().entries.filter((e) => e.dataVersion === version)
  },

  reset: () => set(initialState),
}))
