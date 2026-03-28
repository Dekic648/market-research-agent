/**
 * FindingCard — displays a single analysis finding.
 *
 * Layout hierarchy (researcher-first):
 *   Zone 1: Plain language headline with 3-tier significance badge
 *   Zone 2: Key numbers strip (max 3) + metric footnote
 *   Zone 2b: Effect size explanation (one-line, muted)
 *   Zone 3: Statistical details (collapsed by default)
 *   Zone 4: "What does this mean?" (collapsed, educational)
 *   Flags & verification results (always visible)
 */

import { useState } from 'react'
import './AnalysisDisplay.css'

interface FindingFlag {
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
}

interface VerificationResult {
  checkType: string
  severity: 'warning' | 'info'
  message: string
}

interface KeyMetric {
  label: string
  value: string
}

interface SubgroupContext {
  label: string
  condition: string
  n: number
  totalN: number
}

interface FindingCardProps {
  title: string
  summary: string
  significant: boolean
  pValue: number | null
  effectSize: number | null
  effectLabel: string | null
  flags?: FindingFlag[]
  verificationResults?: VerificationResult[]
  subgroupContext?: SubgroupContext | null
  cvR2?: number | null
  weightedBy?: string
  crossType?: boolean
  /** stepId for context-aware explanations */
  stepId?: string
  onSuppress?: () => void
}

// ============================================================
// Significance badge — 3-tier (green/amber/muted)
// ============================================================

function sigBadge(significant: boolean, pValue: number | null): { className: string; text: string } {
  if (pValue === null) {
    return significant
      ? { className: 'badge-teal', text: 'Significant' }
      : { className: 'badge-muted', text: 'Not significant' }
  }
  if (pValue < 0.001) return { className: 'badge-teal', text: 'Highly significant (p < .001)' }
  if (pValue < 0.05) return { className: 'badge-teal', text: `Significant (p = ${pValue.toFixed(3)})` }
  if (pValue < 0.10) return { className: 'badge-amber', text: `Marginal (p = ${pValue.toFixed(3)})` }
  return { className: 'badge-muted', text: 'Not significant' }
}

// ============================================================
// Key metrics extraction
// ============================================================

function extractKeyMetrics(props: FindingCardProps): KeyMetric[] {
  const metrics: KeyMetric[] = []

  if (props.effectLabel && typeof props.effectLabel === 'string') {
    metrics.push({ label: 'Effect', value: props.effectLabel })
  }

  if (props.pValue !== null && typeof props.pValue === 'number') {
    metrics.push({ label: 'p-value', value: props.pValue < 0.001 ? '< .001' : props.pValue.toFixed(3) })
  }

  if (props.cvR2 !== null && props.cvR2 !== undefined && props.effectSize !== null) {
    metrics.push({ label: 'Training R²', value: props.effectSize.toFixed(3) })
    metrics.push({ label: 'CV R²', value: props.cvR2.toFixed(3) })
    return metrics.slice(0, 3)
  }

  if (props.effectSize !== null && typeof props.effectSize === 'number') {
    metrics.push({ label: 'Effect size', value: props.effectSize.toFixed(3) })
  }

  return metrics.slice(0, 3)
}

// ============================================================
// Metric footnotes — one-line explanations
// ============================================================

const METRIC_FOOTNOTES: Record<string, string> = {
  'Top Box': '% rating in the top 2 points of the scale',
  'p-value': 'Probability the result is due to chance — lower = more confident',
  'Effect size': 'How large the difference or relationship is in practical terms',
  'Effect': 'How large the difference or relationship is in practical terms',
  'r': 'Correlation — how closely two measures move together (−1 to +1)',
  'R²': '% of variation in the outcome explained by these predictors',
  'Training R²': '% of variation explained on the data used to build the model',
  'CV R²': '% of variation explained on held-out data (more realistic estimate)',
  'AUC': 'Model accuracy — 0.5 = random guessing, 1.0 = perfect prediction',
}

function getMetricFootnote(metrics: KeyMetric[]): string | null {
  for (const m of metrics) {
    const note = METRIC_FOOTNOTES[m.label]
    if (note) return `${m.label}: ${note}`
  }
  return null
}

// ============================================================
// Effect size explanation — one sentence
// ============================================================

function getEffectExplanation(stepId: string | undefined, effectSize: number | null, effectLabel: string | null): string | null {
  if (effectSize === null) return null
  const pct = Math.round(effectSize * 100)

  switch (stepId) {
    case 'correlation':
    case 'point_biserial':
      return null // correlation explanation is in summaryLanguage
    case 'kw_significance':
    case 'anova_oneway':
      return `The difference between groups explains ${pct}% of the variation in ratings.`
    case 'regression':
    case 'driver_analysis':
      return `These predictors together explain ${pct}% of what drives the outcome.`
    case 'logistic_regression':
      return effectSize > 0.7
        ? 'The model classifies most cases correctly.'
        : effectSize > 0.6
        ? 'The model performs modestly — some cases misclassified.'
        : 'The model struggles to distinguish the groups.'
    case 'cronbach':
      return effectSize >= 0.7
        ? 'The items measure the same underlying concept well.'
        : 'The items may not form a reliable scale — treat individually.'
    default:
      return null
  }
}

// ============================================================
// "What does this mean?" educational explanations
// ============================================================

function getWhatThisMeans(stepId: string | undefined): string | null {
  switch (stepId) {
    case 'frequency':
    case 'descriptives':
    case 'descriptives_summary':
      return 'This shows how respondents answered this question — the spread of responses across the scale. Top Box tells you what percentage gave the highest ratings.'
    case 'kw_significance':
    case 'anova_oneway':
      return 'We tested whether scores differ across groups. A significant result means the differences are real, not just random noise in the data. Effect size tells you how large the difference is in practice.'
    case 'correlation':
      return 'We measured how closely two variables move together. A positive correlation means when one goes up, the other tends to go up too. A negative correlation means they move in opposite directions.'
    case 'regression':
    case 'driver_analysis':
      return 'We built a model to predict one measure from others. R² tells us how much of the variation the model captures. A higher R² means the predictors do a better job explaining the outcome.'
    case 'logistic_regression':
      return 'We modeled which factors predict a yes/no outcome. An odds ratio above 1 means the factor increases the likelihood; below 1 means it decreases it.'
    case 'cronbach':
      return 'We checked whether the items in this scale measure the same underlying concept. Higher alpha means better internal consistency — the items belong together.'
    case 'efa':
      return 'We looked for hidden patterns in how respondents answered. Items that load on the same factor tend to be answered similarly — they measure the same underlying concept.'
    case 'mediation':
      return 'We tested whether the effect of one variable on another runs partly through a third variable (the mediator). If mediation is significant, some of the effect is indirect.'
    case 'segment_profile':
      return 'We compared how each segment rates across all measured attributes. Segments that score consistently higher or lower across the board have distinct profiles.'
    default:
      return null
  }
}

// ============================================================
// P-value color class
// ============================================================

function pValueColorClass(pValue: number | null): string {
  if (pValue === null) return ''
  if (pValue < 0.05) return 'metric-p-sig'
  if (pValue < 0.10) return 'metric-p-marginal'
  return 'metric-p-nonsig'
}

// ============================================================
// Component
// ============================================================

export function FindingCard({
  title, summary, significant, pValue, effectSize, effectLabel, flags, verificationResults, subgroupContext, weightedBy, crossType, stepId, onSuppress,
}: FindingCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [explainOpen, setExplainOpen] = useState(false)
  const keyMetrics = extractKeyMetrics({ title, summary, significant, pValue, effectSize, effectLabel })
  const badge = sigBadge(significant, pValue)
  const footnote = getMetricFootnote(keyMetrics)
  const effectExplanation = getEffectExplanation(stepId, effectSize, effectLabel)
  const whatThisMeans = getWhatThisMeans(stepId)

  return (
    <div className={`finding-card ${significant ? 'finding-sig' : 'finding-ns'}`}>
      {/* Subgroup badge */}
      {subgroupContext && (
        <div className="finding-subgroup-badge">
          {subgroupContext.label} only — n={subgroupContext.n} of {subgroupContext.totalN}
        </div>
      )}

      {/* Weighted badge */}
      {weightedBy && (
        <div className="finding-weighted-badge">
          Weighted by {weightedBy}
        </div>
      )}

      {/* Cross-type badge */}
      {crossType && (
        <div className="finding-crosstype-badge">
          Survey × Behavioral
        </div>
      )}

      {/* Zone 1 — Plain language headline with 3-tier significance badge */}
      <div className="finding-headline">
        <span className={`finding-badge ${badge.className}`}>
          {badge.text}
        </span>
        <h4 className="finding-title">{String(title ?? '')}</h4>
        <p className="finding-summary">{String(summary ?? '')}</p>
      </div>

      {/* Zone 2 — Key numbers strip (max 3) */}
      {keyMetrics.length > 0 && (
        <div className="finding-key-metrics">
          {keyMetrics.map((m, i) => (
            <div key={i} className={`finding-metric ${m.label === 'p-value' ? pValueColorClass(pValue) : ''}`}>
              <span className="finding-metric-value">{m.value}</span>
              <span className="finding-metric-label">{m.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Metric footnote — one-line definition */}
      {footnote && (
        <div className="finding-metric-footnote">{footnote}</div>
      )}

      {/* Effect size explanation — one sentence */}
      {effectExplanation && (
        <div className="finding-effect-explanation">{effectExplanation}</div>
      )}

      {/* Zone 3 — Full statistics (collapsed by default) */}
      <div className="finding-details-toggle">
        <button
          className="finding-details-btn"
          onClick={() => setDetailsOpen(!detailsOpen)}
        >
          {detailsOpen ? '▾ Hide statistical details' : '▸ Statistical details'}
        </button>
      </div>
      {detailsOpen && (
        <div className="finding-details-body">
          {pValue !== null && typeof pValue === 'number' && (
            <div className="finding-detail-row">
              <span className="finding-detail-label">p-value</span>
              <span className="finding-detail-value">{pValue < 0.001 ? '< .001' : pValue.toFixed(4)}</span>
            </div>
          )}
          {effectSize !== null && typeof effectSize === 'number' && (
            <div className="finding-detail-row">
              <span className="finding-detail-label">Effect size</span>
              <span className="finding-detail-value">{effectSize.toFixed(4)}{effectLabel ? ` (${effectLabel})` : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Zone 4 — "What does this mean?" educational toggle */}
      {whatThisMeans && (
        <>
          <div className="finding-details-toggle">
            <button
              className="finding-details-btn finding-explain-btn"
              onClick={() => setExplainOpen(!explainOpen)}
            >
              {explainOpen ? '▾ Hide explanation' : '▸ What does this mean?'}
            </button>
          </div>
          {explainOpen && (
            <div className="finding-explain-body">
              {whatThisMeans}
            </div>
          )}
        </>
      )}

      {/* Flags — e.g. influential outliers (always visible) */}
      {flags && flags.length > 0 && flags.map((flag, i) => (
        <div key={i} className={`finding-flag finding-flag-${flag.severity}`}>
          {String(flag.message)}
        </div>
      ))}

      {/* Verification results — Simpson's Paradox, moderation (always visible) */}
      {verificationResults && verificationResults.length > 0 && verificationResults.map((vr, i) => {
        const prefix = vr.checkType === 'simpsons_paradox' ? 'Confound check' : 'Moderation check'
        return (
          <div key={`vr_${i}`} className={`finding-flag finding-flag-${vr.severity}`}>
            <strong>{prefix}:</strong> {String(vr.message)}
          </div>
        )
      })}

      {onSuppress && (
        <button className="finding-suppress" onClick={onSuppress}>Hide from report</button>
      )}
    </div>
  )
}
