/**
 * FindingsList — reads FindingsStore, allows drag-to-reorder and suppress.
 * Findings are added to the report schema by clicking "Include".
 */

import { useFindingsStore } from '../../stores/findingsStore'
import type { Finding } from '../../types/dataTypes'
import './Report.css'

interface FindingsListProps {
  onIncludeFinding: (findingId: string) => void
  includedIds: Set<string>
}

export function FindingsList({ onIncludeFinding, includedIds }: FindingsListProps) {
  const findings = useFindingsStore((s) => s.findings)
  const suppress = useFindingsStore((s) => s.suppress)
  const unsuppress = useFindingsStore((s) => s.unsuppress)

  const visible = findings
    .filter((f) => !f.suppressed)
    .sort((a, b) => a.priority - b.priority)

  const suppressed = findings.filter((f) => f.suppressed)

  return (
    <div className="findings-list">
      <h3>Findings ({visible.length})</h3>

      {visible.length === 0 && (
        <p className="empty-message">No findings yet. Run an analysis first.</p>
      )}

      {visible.map((f) => (
        <div key={f.id} className={`finding-row ${includedIds.has(f.id) ? 'included' : ''}`}>
          <div className="finding-row-content">
            <div className="finding-row-header">
              <span className={`sig-dot ${f.significant ? 'sig' : 'ns'}`} />
              <span className="finding-row-title">{f.title}</span>
            </div>
            <p className="finding-row-summary">{f.summary}</p>
            {f.pValue !== null && (
              <span className="finding-row-p">
                p {f.pValue < 0.001 ? '< .001' : `= ${f.pValue.toFixed(3)}`}
                {f.adjustedPValue !== null && f.adjustedPValue !== f.pValue && (
                  <> (adj: {f.adjustedPValue < 0.001 ? '< .001' : f.adjustedPValue.toFixed(3)})</>
                )}
              </span>
            )}
          </div>
          <div className="finding-row-actions">
            <button
              className={`btn btn-sm ${includedIds.has(f.id) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onIncludeFinding(f.id)}
            >
              {includedIds.has(f.id) ? 'Included' : 'Include'}
            </button>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => suppress(f.id)}
              title="Hide from report"
            >
              Hide
            </button>
          </div>
        </div>
      ))}

      {suppressed.length > 0 && (
        <details className="suppressed-section">
          <summary>{suppressed.length} hidden finding(s)</summary>
          {suppressed.map((f) => (
            <div key={f.id} className="finding-row suppressed">
              <span className="finding-row-title">{f.title}</span>
              <button className="btn btn-sm btn-secondary" onClick={() => unsuppress(f.id)}>
                Restore
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
