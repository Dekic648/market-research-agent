/**
 * FindingCard — displays a single analysis finding.
 * Supports flags (e.g. influential_outliers) rendered inline.
 */

import './AnalysisDisplay.css'

interface FindingFlag {
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
}

interface FindingCardProps {
  title: string
  summary: string
  significant: boolean
  pValue: number | null
  effectSize: number | null
  effectLabel: string | null
  flags?: FindingFlag[]
  onSuppress?: () => void
}

export function FindingCard({
  title, summary, significant, pValue, effectLabel, flags, onSuppress,
}: FindingCardProps) {
  return (
    <div className={`finding-card ${significant ? 'finding-sig' : 'finding-ns'}`}>
      <div className="finding-header">
        <span className={`finding-badge ${significant ? 'badge-teal' : 'badge-amber'}`}>
          {significant ? 'Significant' : 'Not significant'}
        </span>
        {pValue !== null && typeof pValue === 'number' && (
          <span className="finding-p">
            p {pValue < 0.001 ? '< .001' : `= ${pValue.toFixed(3)}`}
          </span>
        )}
        {effectLabel && typeof effectLabel === 'string' && (
          <span className="finding-effect">{effectLabel} effect</span>
        )}
      </div>
      <h4 className="finding-title">{String(title ?? '')}</h4>
      <p className="finding-summary">{String(summary ?? '')}</p>

      {/* Flags — e.g. influential outliers */}
      {flags && flags.length > 0 && flags.map((flag, i) => (
        <div key={i} className={`finding-flag finding-flag-${flag.severity}`}>
          {String(flag.message)}
        </div>
      ))}

      {onSuppress && (
        <button className="finding-suppress" onClick={onSuppress}>Hide from report</button>
      )}
    </div>
  )
}
