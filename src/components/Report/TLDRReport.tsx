/**
 * TLDRReport — auto-generated report ordered by research flow priority.
 *
 * Sections:
 *   A. Executive summary strip
 *   B. Findings grouped by tier with section headers
 *   C. Flagged findings (verification warnings)
 */

import { useMemo } from 'react'
import { useFindingsStore } from '../../stores/findingsStore'
import { FindingCard } from '../AnalysisDisplay/FindingCard'
import { buildExecutiveSummary, TIER_NAMES, REPORT_PRIORITY } from '../../report/schema/executiveSummary'
import type { Finding } from '../../types/dataTypes'
import './TLDRReport.css'

interface TierGroup {
  tier: number
  name: string
  findings: Finding[]
}

export function TLDRReport() {
  const findings = useFindingsStore((s) => s.findings)
  const orderedFindings = useMemo(() => {
    const active = findings.filter((f) => !f.suppressed)
    return [...active].sort((a, b) => {
      const prioA = REPORT_PRIORITY[a.stepId] ?? 99
      const prioB = REPORT_PRIORITY[b.stepId] ?? 99
      if (prioA !== prioB) return prioA - prioB
      return Math.abs(b.effectSize ?? 0) - Math.abs(a.effectSize ?? 0)
    })
  }, [findings])

  const executiveSummary = useMemo(
    () => buildExecutiveSummary(orderedFindings),
    [orderedFindings]
  )

  const tierGroups = useMemo(() => {
    const groups = new Map<number, Finding[]>()
    for (const f of orderedFindings) {
      const tier = REPORT_PRIORITY[f.stepId] ?? 99
      if (!groups.has(tier)) groups.set(tier, [])
      groups.get(tier)!.push(f)
    }
    const result: TierGroup[] = []
    for (const [tier, findings] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
      result.push({ tier, name: TIER_NAMES[tier] ?? `Other (priority ${tier})`, findings })
    }
    return result
  }, [orderedFindings])

  const flaggedFindings = useMemo(() => {
    return orderedFindings.filter(
      (f) => f.verificationResults?.some((vr) => vr.severity === 'warning')
    )
  }, [orderedFindings])

  if (orderedFindings.length === 0) {
    return (
      <div className="tldr-report">
        <div className="tldr-empty card">
          <p>No findings to report. Run an analysis first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tldr-report">
      {/* Section A — Executive Summary */}
      {executiveSummary.length > 0 && (
        <div className="tldr-executive card">
          <h2 className="tldr-exec-title">Key findings</h2>
          <ul className="tldr-exec-list">
            {executiveSummary.map((sentence, i) => (
              <li key={i} className="tldr-exec-item">{sentence}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Section B — Findings by tier */}
      <div className="tldr-tiers">
        {tierGroups.map((group) => (
          <div key={group.tier} className="tldr-tier-section">
            <h3 className="tldr-tier-header">{group.name}</h3>
            <div className="tldr-tier-findings">
              {group.findings.map((f) => (
                <FindingCard
                  key={f.id}
                  title={f.title}
                  summary={f.summary}
                  significant={f.significant}
                  pValue={f.pValue}
                  effectSize={f.effectSize}
                  effectLabel={f.effectLabel}
                  flags={undefined}
                  verificationResults={f.verificationResults}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Section C — Flagged findings */}
      {flaggedFindings.length > 0 && (
        <div className="tldr-warnings card">
          <h3 className="tldr-warnings-title">Results requiring attention</h3>
          {flaggedFindings.map((f) => (
            <div key={f.id} className="tldr-warning-item">
              <div className="tldr-warning-finding">{f.title}</div>
              {f.verificationResults
                ?.filter((vr) => vr.severity === 'warning')
                .map((vr, i) => (
                  <div key={i} className="tldr-warning-message">
                    {vr.checkType === 'simpsons_paradox' ? 'Confound check' : 'Moderation check'}: {vr.message}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
