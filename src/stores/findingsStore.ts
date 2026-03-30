/**
 * FindingsStore — typed API for managing analysis findings.
 * pushFinding() does NOT exist. Use add() only.
 */
import { create } from 'zustand'
import type { Finding } from '../types/dataTypes'

/** Report priority by plugin/step ID — lower = appears earlier in report */
const REPORT_PRIORITY: Record<string, number> = {
  frequency: 1,
  crosstab: 2,
  segment_profile: 2,
  kw_significance: 3,
  posthoc: 3,
  correlation: 4,
  point_biserial: 4,
  cronbach: 5,
  efa: 5,
  regression: 6,
  driver_analysis: 6,
}

/** Normalize effect size to 0–1 scale for cross-metric comparison */
function normalizeEffectSize(finding: Finding): number {
  if (finding.effectSize === null) return 0
  const e = Math.abs(finding.effectSize)
  // R², r, epsilon² are already 0–1 scale
  // Cohen's d: cap at 2.0 and divide by 2
  if (e > 1) return Math.min(1, e / 2)
  return e
}

interface FindingsStoreState {
  findings: Finding[]
  fdrApplied: boolean

  /** The only way to create a finding */
  add: (finding: Finding) => void

  /** Suppress a finding — it stays in the store but is hidden from reports */
  suppress: (findingId: string) => void

  /** Unsuppress a previously suppressed finding */
  unsuppress: (findingId: string) => void

  /** Move a finding to a new position (after the given findingId) */
  reorder: (findingId: string, afterId: string | null) => void

  /** Group all findings by theme — returns sorted findings, updates store */
  groupByTheme: () => void

  /** Get findings for a specific step */
  filterByStep: (stepId: string) => Finding[]

  /** Findings sorted by reportPriority tier, then by narrativeWeight within tier */
  getOrderedForReport: () => Finding[]

  /**
   * Post-accumulation pass: adjust all p-values for multiple comparisons.
   * Must be called AFTER all significance findings are accumulated.
   */
  applyFDRCorrection: (method: 'bonferroni' | 'bh') => void

  /** Attach a post-analysis verification result to an existing finding */
  attachVerificationResult: (findingId: string, result: import('../types/dataTypes').VerificationResult) => void

  reset: () => void
}

const initialState = {
  findings: [] as Finding[],
  fdrApplied: false,
}

export const useFindingsStore = create<FindingsStoreState>()((set, get) => ({
  ...initialState,

  add: (finding) =>
    set((s) => ({ findings: [...s.findings, finding] })),

  suppress: (findingId) =>
    set((s) => ({
      findings: s.findings.map((f) =>
        f.id === findingId ? { ...f, suppressed: true } : f
      ),
    })),

  unsuppress: (findingId) =>
    set((s) => ({
      findings: s.findings.map((f) =>
        f.id === findingId ? { ...f, suppressed: false } : f
      ),
    })),

  reorder: (findingId, afterId) =>
    set((s) => {
      const findings = [...s.findings]
      const idx = findings.findIndex((f) => f.id === findingId)
      if (idx === -1) return s

      const [item] = findings.splice(idx, 1)

      if (afterId === null) {
        // Move to the beginning
        findings.unshift(item)
      } else {
        const afterIdx = findings.findIndex((f) => f.id === afterId)
        if (afterIdx === -1) return s
        findings.splice(afterIdx + 1, 0, item)
      }

      // Update priorities to reflect new order
      return {
        findings: findings.map((f, i) => ({ ...f, priority: i })),
      }
    }),

  groupByTheme: () =>
    set((s) => {
      const sorted = [...s.findings].sort((a, b) => {
        // Group by theme first, then by priority within theme
        const themeA = a.theme ?? ''
        const themeB = b.theme ?? ''
        if (themeA !== themeB) return themeA.localeCompare(themeB)
        return a.priority - b.priority
      })
      return {
        findings: sorted.map((f, i) => ({ ...f, priority: i })),
      }
    }),

  filterByStep: (stepId) => {
    return get().findings.filter((f) => f.stepId === stepId)
  },

  getOrderedForReport: () => {
    const findings = get().findings.filter((f) => !f.suppressed)
    return [...findings].sort((a, b) => {
      const prioA = REPORT_PRIORITY[a.stepId] ?? 99
      const prioB = REPORT_PRIORITY[b.stepId] ?? 99
      if (prioA !== prioB) return prioA - prioB
      // Within same priority tier, higher narrativeWeight first (fall back to effect size)
      const wA = a.narrativeWeight ?? normalizeEffectSize(a)
      const wB = b.narrativeWeight ?? normalizeEffectSize(b)
      return wB - wA
    })
  },

  applyFDRCorrection: (method) =>
    set((s) => {
      const withP = s.findings.filter(
        (f) => f.pValue !== null && f.pValue !== undefined
      )
      const withoutP = s.findings.filter(
        (f) => f.pValue === null || f.pValue === undefined
      )

      if (withP.length === 0) return s

      const m = withP.length

      if (method === 'bonferroni') {
        const adjusted = withP.map((f) => ({
          ...f,
          adjustedPValue: Math.min(1, (f.pValue ?? 1) * m),
        }))
        return { findings: [...adjusted, ...withoutP], fdrApplied: true }
      }

      // Benjamini-Hochberg
      const sorted = [...withP].sort(
        (a, b) => (a.pValue ?? 1) - (b.pValue ?? 1)
      )
      const adjustedMap = new Map<string, number>()

      // Step-up procedure
      let minSoFar = 1
      for (let i = m - 1; i >= 0; i--) {
        const rank = i + 1
        const raw = sorted[i].pValue ?? 1
        const adjusted = Math.min(minSoFar, (raw * m) / rank)
        minSoFar = adjusted
        adjustedMap.set(sorted[i].id, Math.min(1, adjusted))
      }

      const allFindings = s.findings.map((f) => ({
        ...f,
        adjustedPValue: adjustedMap.get(f.id) ?? f.adjustedPValue,
      }))

      return { findings: allFindings, fdrApplied: true }
    }),

  attachVerificationResult: (findingId, result) =>
    set((s) => ({
      findings: s.findings.map((f) =>
        f.id === findingId
          ? { ...f, verificationResults: [...(f.verificationResults ?? []), result] }
          : f
      ),
    })),

  reset: () => set(initialState),
}))
