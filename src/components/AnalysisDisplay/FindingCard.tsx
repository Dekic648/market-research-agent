/**
 * FindingCard — displays a single analysis finding.
 *
 * Layout hierarchy (researcher-first):
 *   Zone 1: Plain language headline (always visible)
 *   Zone 2: Key numbers strip (always visible, max 3 items)
 *   Zone 3: Statistical details (collapsed by default)
 *   Flags & verification results (always visible, below details)
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
  onSuppress?: () => void
}

function extractKeyMetrics(props: FindingCardProps): KeyMetric[] {
  const metrics: KeyMetric[] = []

  if (props.effectLabel && typeof props.effectLabel === 'string') {
    metrics.push({ label: 'Effect', value: props.effectLabel })
  }

  if (props.pValue !== null && typeof props.pValue === 'number') {
    metrics.push({ label: 'p-value', value: props.pValue < 0.001 ? '< .001' : props.pValue.toFixed(3) })
  }

  // Show CV R² alongside training R² when available
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

export function FindingCard({
  title, summary, significant, pValue, effectSize, effectLabel, flags, verificationResults, subgroupContext, weightedBy, crossType, onSuppress,
}: FindingCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const keyMetrics = extractKeyMetrics({ title, summary, significant, pValue, effectSize, effectLabel })

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

      {/* Zone 1 — Plain language headline */}
      <div className="finding-headline">
        <span className={`finding-badge ${significant ? 'badge-teal' : 'badge-amber'}`}>
          {significant ? 'Significant' : 'Not significant'}
        </span>
        <h4 className="finding-title">{String(title ?? '')}</h4>
        <p className="finding-summary">{String(summary ?? '')}</p>
      </div>

      {/* Zone 2 — Key numbers strip (max 3) */}
      {keyMetrics.length > 0 && (
        <div className="finding-key-metrics">
          {keyMetrics.map((m, i) => (
            <div key={i} className="finding-metric">
              <span className="finding-metric-value">{m.value}</span>
              <span className="finding-metric-label">{m.label}</span>
            </div>
          ))}
        </div>
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
