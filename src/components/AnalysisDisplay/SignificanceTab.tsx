/**
 * SignificanceTab — Tab III: per-question KW/ANOVA significance verdicts.
 */

import { useMemo, useState } from 'react'
import { FindingCard } from './FindingCard'
import { truncateLabel } from '../../engine/chartDefaults'
import type { Finding } from '../../types/dataTypes'
import type { PluginStepResult } from '../../plugins/types'

interface SignificanceTabProps {
  findings: Finding[]
  taskStepResults: Record<string, PluginStepResult>
  questionOrder: string[]
  showNonSig: boolean
}

const SIG_STEP_IDS = new Set(['kw_significance', 'anova_oneway'])

interface SigBlockData {
  label: string
  finding: Finding
  posthocPairs: string[]
}

/** Extract pairwise comparisons from posthoc finding detail */
function extractPosthocPairs(findings: Finding[], label: string): string[] {
  const posthocFinding = findings.find((f) =>
    f.stepId === 'posthoc' && f.sourceQuestionLabel === label && f.significant
  )
  if (!posthocFinding) return []

  try {
    const pairs = JSON.parse(posthocFinding.detail)
    if (Array.isArray(pairs)) {
      return pairs
        .filter((p: any) => p.significant)
        .map((p: any) => `${p.groupA} ≠ ${p.groupB}`)
        .slice(0, 5)
    }
  } catch { /* not JSON */ }
  return []
}

export function SignificanceTab({ findings, taskStepResults, questionOrder, showNonSig }: SignificanceTabProps) {
  const blocks = useMemo(() => {
    const result: SigBlockData[] = []

    for (const label of questionOrder) {
      const sigFinding = findings.find((f) =>
        SIG_STEP_IDS.has(f.stepId) && f.sourceQuestionLabel === label && !f.suppressed
      )
      if (!sigFinding) continue
      const posthocPairs = extractPosthocPairs(findings, label)
      result.push({ label, finding: sigFinding, posthocPairs })
    }

    // Also catch findings with no questionOrder match
    const coveredLabels = new Set(result.map((b) => b.label))
    for (const f of findings) {
      if (!SIG_STEP_IDS.has(f.stepId) || f.suppressed) continue
      const label = f.sourceQuestionLabel ?? f.title
      if (coveredLabels.has(label)) continue
      coveredLabels.add(label)
      const posthocPairs = extractPosthocPairs(findings, label)
      result.push({ label, finding: f, posthocPairs })
    }

    // Sort: significant first, then non-significant
    result.sort((a, b) => {
      if (a.finding.significant && !b.finding.significant) return -1
      if (!a.finding.significant && b.finding.significant) return 1
      return 0
    })

    return result
  }, [findings, questionOrder])

  const visibleBlocks = useMemo(
    () => showNonSig ? blocks : blocks.filter((b) => b.finding.significant),
    [blocks, showNonSig]
  )

  if (blocks.length === 0) {
    return (
      <div className="results-empty-tab">
        No significance tests were run. Add a segment variable to compare groups.
      </div>
    )
  }

  const hiddenCount = blocks.length - visibleBlocks.length

  return (
    <div className="significance-tab">
      {hiddenCount > 0 && !showNonSig && (
        <div className="results-ns-hint">{hiddenCount} non-significant results hidden</div>
      )}
      {visibleBlocks.map((block) => (
        <SignificanceBlock key={block.label} block={block} />
      ))}
    </div>
  )
}

function SignificanceBlock({ block }: { block: SigBlockData }) {
  const [statsOpen, setStatsOpen] = useState(false)
  const displayLabel = truncateLabel(block.label, 60)
  const { finding, posthocPairs } = block

  return (
    <div className={`result-question-block ${!finding.significant ? 'rqb-muted' : ''}`}>
      <div className="rqb-header">
        <h4 className="rqb-title" title={block.label}>{displayLabel}</h4>
      </div>

      <div className="rqb-body">
        {/* Verdict line */}
        {finding.significant ? (
          <div className="rqb-verdict rqb-verdict--significant">
            <strong>&#10003; Significant difference across segments</strong>
            {finding.effectLabel && (
              <span className="rqb-effect-label">{finding.effectLabel}</span>
            )}
          </div>
        ) : (
          <div className="rqb-verdict rqb-verdict--ns">
            &#10007; No meaningful difference across segments
          </div>
        )}

        {/* Post-hoc pairs */}
        {posthocPairs.length > 0 && (
          <div className="sig-posthoc-pairs">
            {posthocPairs.join(' · ')}
          </div>
        )}

        {/* Statistical details toggle */}
        <button className="rqb-stats-toggle" onClick={() => setStatsOpen(!statsOpen)}>
          {statsOpen ? '− Statistical details' : '+ Statistical details'}
        </button>

        {statsOpen && (
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
}
