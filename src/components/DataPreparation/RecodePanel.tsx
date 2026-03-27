/**
 * RecodePanel — driven by DetectionLayer flags.
 *
 * Pre-populated with reverse-coding candidates. User confirms or dismisses.
 * Confirmed flags → addTransform(ReverseCodeTransform) on the column.
 * Rule: never writes to rawValues — only calls addTransform().
 */

import { useState } from 'react'
import type { DetectionFlag } from '../../detection/types'
import type { Transform } from '../../types/dataTypes'
import './PrepPanels.css'

interface RecodePanelProps {
  flags: DetectionFlag[]
  onConfirmRecode: (columnId: string, transform: Transform) => void
  onDismissFlag: (flagId: string) => void
}

export function RecodePanel({ flags, onConfirmRecode, onDismissFlag }: RecodePanelProps) {
  const reverseFlags = flags.filter((f) => f.type === 'reverse_coded')
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())

  if (reverseFlags.length === 0) {
    return (
      <div className="prep-panel">
        <div className="prep-panel-header"><h3>Reverse Coding</h3></div>
        <div className="prep-panel-body">
          <div className="no-missing">No reverse-coding candidates detected.</div>
        </div>
      </div>
    )
  }

  const activeFlags = reverseFlags.filter((f) => !dismissed.has(f.id) && !confirmed.has(f.id))
  const confirmedFlags = reverseFlags.filter((f) => confirmed.has(f.id))

  return (
    <div className="prep-panel">
      <div className="prep-panel-header">
        <h3>Reverse Coding</h3>
        {activeFlags.length > 0 && (
          <span className="badge badge-amber">{activeFlags.length} pending</span>
        )}
      </div>

      <div className="prep-panel-body">
        {activeFlags.map((flag) => (
          <div key={flag.id} className="recode-item">
            <div className="recode-info">
              <span className="recode-column">{flag.columnId}</span>
              <span className="recode-message">{flag.message}</span>
              <div className="recode-sources">
                {flag.source === 'statistical' && <span className="badge badge-purple">Statistical</span>}
                {flag.source === 'semantic' && <span className="badge badge-teal">Semantic</span>}
                <span className="recode-confidence">
                  {(flag.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
            </div>
            <div className="recode-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setConfirmed((prev) => new Set(prev).add(flag.id))
                  const scaleRange = (flag.detail as any)?.scaleRange ?? [1, 5]
                  onConfirmRecode(flag.columnId, {
                    id: `rev_${flag.columnId}_${Date.now()}`,
                    type: 'reverseCode',
                    params: { scaleMin: scaleRange[0], scaleMax: scaleRange[1] },
                    enabled: true,
                    createdAt: Date.now(),
                    createdBy: 'user',
                    source: 'auto-detected',
                  })
                }}
              >
                Reverse
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setDismissed((prev) => new Set(prev).add(flag.id))
                  onDismissFlag(flag.id)
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}

        {confirmedFlags.length > 0 && (
          <div className="recode-confirmed">
            {confirmedFlags.length} item(s) will be reverse-coded
          </div>
        )}

        {activeFlags.length === 0 && confirmedFlags.length === 0 && (
          <div className="no-missing">All flags resolved.</div>
        )}
      </div>
    </div>
  )
}
