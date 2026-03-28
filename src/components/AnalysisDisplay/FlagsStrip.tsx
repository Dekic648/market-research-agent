/**
 * FlagsStrip — dismissible banner showing verification warnings.
 * Renders at the top of results when any finding has Simpson's Paradox
 * or moderation warnings from PostAnalysisVerifier.
 */

import { useState } from 'react'
import type { Finding, VerificationResult } from '../../types/dataTypes'

interface FlaggedItem {
  findingTitle: string
  result: VerificationResult
}

interface FlagsStripProps {
  findings: Finding[]
}

export function FlagsStrip({ findings }: FlagsStripProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const flaggedItems: FlaggedItem[] = []
  for (const f of findings) {
    if (!f.verificationResults) continue
    for (const vr of f.verificationResults) {
      if (vr.severity === 'warning') {
        flaggedItems.push({ findingTitle: f.title, result: vr })
      }
    }
  }

  if (flaggedItems.length === 0) return null

  return (
    <div className="flags-strip card">
      <div className="flags-strip-header">
        <span className="flags-strip-icon">!</span>
        <strong>{flaggedItems.length} result{flaggedItems.length > 1 ? 's' : ''} flagged for review</strong>
        <button className="flags-strip-dismiss" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
      <div className="flags-strip-items">
        {flaggedItems.map((item, i) => (
          <div key={i} className="flags-strip-item">
            <span className="flags-strip-finding">{item.findingTitle}</span>
            <span className="flags-strip-type">
              {item.result.checkType === 'simpsons_paradox' ? 'Confound check' : 'Moderation check'}:
            </span>
            <span className="flags-strip-message">{item.result.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
