/**
 * SignificanceTab — Tab III: per-question KW/ANOVA significance verdicts.
 *
 * Layout:
 *   A) Summary table — one row per tested question
 *   B) Question blocks — expanded on row click
 */

import { useMemo, useState, useCallback, useRef } from 'react'
import { FindingCard } from './FindingCard'
import { truncateLabel } from '../../engine/chartDefaults'
import type { Finding } from '../../types/dataTypes'
import type { PluginStepResult } from '../../plugins/types'
import './AnalysisDisplay.css'

interface SignificanceTabProps {
  findings: Finding[]
  taskStepResults: Record<string, PluginStepResult>
  questionOrder: string[]
  showNonSig: boolean
}

const SIG_STEP_IDS = new Set(['kw_significance', 'anova_oneway'])

function labelMatches(finding: Finding, blockLabel: string): boolean {
  const sql = finding.sourceQuestionLabel
  if (!sql) return false
  if (sql === blockLabel) return true
  if (sql.startsWith(blockLabel)) return true
  return false
}

// ============================================================
// Detail parsing
// ============================================================

interface ParsedDetail {
  testUsed: string
  H: number | null
  F: number | null
  epsilonSquared: number | null
  etaSquared: number | null
  groupLabels: string[]
  groupMeans: number[]
  groupNs: number[]
  pairs: Array<{ groupA: string; groupB: string; significant: boolean }>
}

function parseDetail(finding: Finding): ParsedDetail {
  const empty: ParsedDetail = {
    testUsed: 'KW', H: null, F: null, epsilonSquared: null, etaSquared: null,
    groupLabels: [], groupMeans: [], groupNs: [], pairs: [],
  }
  try {
    const d = JSON.parse(finding.detail)
    return {
      testUsed: d.testUsed ?? d.method ?? d.testName ?? 'KW',
      H: d.H ?? null,
      F: d.F ?? null,
      epsilonSquared: d.epsilonSquared ?? null,
      etaSquared: d.etaSquared ?? d.eta2 ?? null,
      groupLabels: d.groupLabels ?? [],
      groupMeans: d.groupMeans ?? [],
      groupNs: d.groupNs ?? d.nPerGroup ?? [],
      pairs: d.pairs ?? d.pairwiseComparisons ?? [],
    }
  } catch {
    return empty
  }
}

// ============================================================
// Effect pill colors
// ============================================================

const EFFECT_COLORS: Record<string, { bg: string; color: string }> = {
  large: { bg: '#ef4444', color: 'white' },
  medium: { bg: '#f97316', color: 'white' },
  small: { bg: '#eab308', color: '#1a1a1a' },
  negligible: { bg: '#9ca3af', color: 'white' },
}

function getEffectColor(label: string | null): { bg: string; color: string } {
  return EFFECT_COLORS[label?.toLowerCase() ?? ''] ?? EFFECT_COLORS.negligible
}

function slugify(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
}

// ============================================================
// Method display helpers
// ============================================================

function methodDisplay(testUsed: string): { label: string; reason: string } {
  const t = testUsed.toLowerCase()
  if (t.includes('welch')) return { label: "Welch's ANOVA", reason: 'normality met but unequal variances (Levene\'s p < 0.05)' }
  if (t.includes('anova')) return { label: 'One-way ANOVA', reason: 'normality assumption met, n ≥ 50' }
  return { label: 'Kruskal-Wallis H', reason: 'non-parametric — robust to skewed distributions' }
}

function methodAbbrev(testUsed: string): string {
  const t = testUsed.toLowerCase()
  if (t.includes('welch')) return 'Welch'
  if (t.includes('anova')) return 'ANOVA'
  return 'KW'
}

// ============================================================
// Block data
// ============================================================

interface SigBlockData {
  label: string
  finding: Finding
  detail: ParsedDetail
  posthocPairs: string[]
}

function extractPosthocPairs(findings: Finding[], label: string): string[] {
  const posthocFinding = findings.find((f) =>
    f.stepId === 'posthoc' && f.significant && (
      f.sourceQuestionLabel === label ||
      (f.sourceQuestionLabel?.startsWith(label))
    )
  )
  if (!posthocFinding) return []
  try {
    const pairs = JSON.parse(posthocFinding.detail)
    if (Array.isArray(pairs)) {
      return pairs
        .filter((p: any) => p.significant)
        .map((p: any) => `${p.groupA} ≠ ${p.groupB}`)
    }
  } catch { /* not JSON */ }
  return []
}

// ============================================================
// Normalize effect for bar width (0–1)
// ============================================================

function normalizeEffect(effectSize: number | null): number {
  if (effectSize === null) return 0
  // ε² and η² are typically 0–0.3 for large. Map 0–0.2 to 0–1.
  return Math.min(1, effectSize / 0.2)
}

// ============================================================
// Component
// ============================================================

export function SignificanceTab({ findings, taskStepResults, questionOrder, showNonSig }: SignificanceTabProps) {
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set())
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const blocks = useMemo(() => {
    const result: SigBlockData[] = []
    const matchedIds = new Set<string>()

    // Pass 1: match by questionOrder
    for (const label of questionOrder) {
      const sigFinding = findings.find((f) =>
        SIG_STEP_IDS.has(f.stepId) && labelMatches(f, label) && !f.suppressed
      )
      if (!sigFinding) continue
      matchedIds.add(sigFinding.id)
      const detail = parseDetail(sigFinding)
      const posthocPairs = extractPosthocPairs(findings, label)
      result.push({ label, finding: sigFinding, detail, posthocPairs })
    }

    // Warn about unmatched
    for (const f of findings) {
      if (!SIG_STEP_IDS.has(f.stepId) || f.suppressed) continue
      if (!matchedIds.has(f.id)) {
        console.warn(`[SignificanceTab] Unmatched finding: "${f.sourceQuestionLabel}" (id: ${f.id})`)
      }
    }

    // Sort: significant first (by narrativeWeight DESC), then non-significant
    result.sort((a, b) => {
      if (a.finding.significant && !b.finding.significant) return -1
      if (!a.finding.significant && b.finding.significant) return 1
      return (b.finding.narrativeWeight ?? 0) - (a.finding.narrativeWeight ?? 0)
    })

    return result
  }, [findings, questionOrder])

  const visibleBlocks = useMemo(
    () => showNonSig ? blocks : blocks.filter((b) => b.finding.significant),
    [blocks, showNonSig]
  )

  const sigCount = blocks.filter((b) => b.finding.significant).length

  const toggleExpand = useCallback((label: string) => {
    setExpandedLabels((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
    // Scroll to block
    setTimeout(() => {
      const el = blockRefs.current[label]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [])

  if (blocks.length === 0) {
    return (
      <div className="results-empty-tab">
        No significance tests were run. Add a segment variable to compare groups.
      </div>
    )
  }

  return (
    <div className="significance-tab">
      {/* Section A — Summary table */}
      <div className="sig-summary-header">
        Significance Overview — {blocks.length} question{blocks.length !== 1 ? 's' : ''} tested, {sigCount} significant
      </div>
      <div className="sig-summary-table-wrapper">
        <table className="sig-summary-table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Result</th>
              <th>Effect</th>
              <th>Method</th>
              <th>Segments that differ</th>
            </tr>
          </thead>
          <tbody>
            {visibleBlocks.map((block) => {
              const isExpanded = expandedLabels.has(block.label)
              const ec = getEffectColor(block.finding.effectLabel)
              const pairs = block.posthocPairs
              const pairDisplay = pairs.length === 0 ? '—'
                : pairs.length <= 2 ? pairs.join(' · ')
                : `${pairs[0]} +${pairs.length - 1} more`

              return (
                <tr
                  key={block.label}
                  className={`sig-table-row ${isExpanded ? 'sig-table-row--active' : ''} ${!block.finding.significant ? 'sig-table-row--ns' : ''}`}
                  onClick={() => toggleExpand(block.label)}
                >
                  <td title={block.label}>{truncateLabel(block.label, 45)}</td>
                  <td>
                    {block.finding.significant
                      ? <span className="sig-result sig-result--yes">&#10003; Significant</span>
                      : <span className="sig-result sig-result--no">&#10007; Not significant</span>
                    }
                  </td>
                  <td>
                    {block.finding.significant && block.finding.effectLabel ? (
                      <span className="sig-effect-pill" style={{ background: ec.bg, color: ec.color }}>
                        {block.finding.effectLabel}
                      </span>
                    ) : '—'}
                  </td>
                  <td>{methodAbbrev(block.detail.testUsed)}</td>
                  <td>{block.finding.significant ? pairDisplay : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!showNonSig && blocks.length > visibleBlocks.length && (
        <div className="results-ns-hint">
          {blocks.length - visibleBlocks.length} non-significant results hidden
        </div>
      )}

      {/* Section B — Question blocks */}
      <div className="sig-blocks">
        {visibleBlocks.map((block) => (
          <SignificanceBlock
            key={block.label}
            block={block}
            expanded={expandedLabels.has(block.label)}
            onToggle={() => toggleExpand(block.label)}
            ref={(el) => { blockRefs.current[block.label] = el }}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================
// SignificanceBlock
// ============================================================

import { forwardRef } from 'react'

const SignificanceBlock = forwardRef<HTMLDivElement, {
  block: SigBlockData
  expanded: boolean
  onToggle: () => void
}>(function SignificanceBlock({ block, expanded, onToggle }, ref) {
  const { finding, detail, posthocPairs } = block
  const displayLabel = truncateLabel(block.label, 60)
  const ec = getEffectColor(finding.effectLabel)
  const effectVal = detail.epsilonSquared ?? detail.etaSquared
  const effectSymbol = detail.etaSquared !== null ? 'η²' : 'ε²'
  const method = methodDisplay(detail.testUsed)
  const barWidth = normalizeEffect(finding.effectSize)

  // Build segment means map
  const segmentMeans: Array<{ label: string; mean: number }> = []
  if (detail.groupLabels.length > 0 && detail.groupMeans.length > 0) {
    for (let i = 0; i < detail.groupLabels.length; i++) {
      if (i < detail.groupMeans.length) {
        segmentMeans.push({ label: detail.groupLabels[i], mean: detail.groupMeans[i] })
      }
    }
  }
  const maxMean = segmentMeans.length > 0 ? Math.max(...segmentMeans.map((s) => s.mean)) : null
  const minMean = segmentMeans.length > 0 ? Math.min(...segmentMeans.map((s) => s.mean)) : null

  return (
    <div
      ref={ref}
      id={`sig-block-${slugify(block.label)}`}
      className={`result-question-block ${!finding.significant ? 'rqb-muted' : ''}`}
    >
      {/* 1. Question label */}
      <div className="rqb-header">
        <h3 className="rqb-title" title={block.label}>{displayLabel}</h3>
      </div>

      <div className="rqb-body">
        {/* 2. Verdict line */}
        {finding.significant ? (
          <div className="rqb-verdict rqb-verdict--significant">
            <strong>&#10003; Significant difference across segments</strong>
          </div>
        ) : (
          <div className="rqb-verdict rqb-verdict--ns">
            &#10007; No meaningful difference across segments
          </div>
        )}

        {/* 3. Effect size visual */}
        {finding.significant && (
          <div className="sig-effect-row">
            <div className="sig-effect-bar-track">
              <div
                className="sig-effect-bar-fill"
                style={{ width: `${Math.round(barWidth * 100)}%`, background: ec.bg, borderRadius: 4 }}
              />
            </div>
            <span className="sig-effect-text">
              {finding.effectLabel}{effectVal !== null ? ` (${effectSymbol} = ${effectVal.toFixed(2)})` : ''}
            </span>
          </div>
        )}

        {/* 4. Method line */}
        <div className="sig-method-line">
          Test used: {method.label}
          <span className="sig-method-reason"> — {method.reason}</span>
        </div>

        {/* 5. Segment means strip */}
        {finding.significant && segmentMeans.length > 0 && (
          <div className="sig-segment-strip">
            {segmentMeans.map((s) => {
              const isMax = s.mean === maxMean
              const isMin = s.mean === minMean
              const chipClass = isMax ? 'sig-chip sig-chip--high' : isMin ? 'sig-chip sig-chip--low' : 'sig-chip'
              return (
                <span key={s.label} className={chipClass}>
                  {s.label}: {s.mean.toFixed(2)}
                </span>
              )
            })}
          </div>
        )}

        {/* 6. Post-hoc pairs */}
        {finding.significant && posthocPairs.length > 0 && (
          <div className="sig-posthoc-pairs">
            {posthocPairs.slice(0, 5).join(' · ')}
            {posthocPairs.length > 5 && ` +${posthocPairs.length - 5} more`}
          </div>
        )}

        {/* 7. Statistical details toggle */}
        <button className="rqb-stats-toggle" onClick={onToggle}>
          {expanded ? '− Statistical details' : '+ Statistical details'}
        </button>

        {expanded && (
          <div className="rqb-findings">
            <FindingCard
              title={finding.title}
              summary={finding.summary}
              significant={finding.significant}
              pValue={finding.pValue}
              effectSize={finding.effectSize}
              effectLabel={finding.effectLabel}
              flags={(finding as any).flags}
              verificationResults={finding.verificationResults}
              stepId={finding.stepId}
            />
          </div>
        )}
      </div>
    </div>
  )
})

export { SignificanceTab as default }
