/**
 * SectionSummaryCard — compact summary below each MethodSection in results view.
 *
 * Shows summaryLanguage for the top 1-2 findings from the section.
 * Links to the TLDR executive summary.
 */

import type { Finding } from '../../types/dataTypes'

interface SectionSummaryCardProps {
  findings: Finding[]
  onOpenTLDR?: () => void
}

export function SectionSummaryCard({ findings, onOpenTLDR }: SectionSummaryCardProps) {
  // Pick top 1-2 findings by effect size
  const ranked = [...findings]
    .filter((f) => !f.suppressed)
    .sort((a, b) => Math.abs(b.effectSize ?? 0) - Math.abs(a.effectSize ?? 0))
    .slice(0, 2)

  if (ranked.length === 0) return null

  return (
    <div className="section-summary-card">
      <div className="section-summary-content">
        {ranked.map((f) => (
          <p key={f.id} className="section-summary-text">{f.summaryLanguage}</p>
        ))}
      </div>
      {onOpenTLDR && (
        <button className="section-summary-link" onClick={onOpenTLDR}>
          See executive summary →
        </button>
      )}
    </div>
  )
}
