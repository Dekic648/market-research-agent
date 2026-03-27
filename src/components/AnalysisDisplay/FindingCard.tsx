/**
 * FindingCard — displays a single analysis finding.
 */

import './AnalysisDisplay.css'

interface FindingCardProps {
  title: string
  summary: string
  significant: boolean
  pValue: number | null
  effectSize: number | null
  effectLabel: string | null
  onSuppress?: () => void
}

export function FindingCard({
  title, summary, significant, pValue, effectLabel, onSuppress,
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
      {onSuppress && (
        <button className="finding-suppress" onClick={onSuppress}>Hide from report</button>
      )}
    </div>
  )
}
