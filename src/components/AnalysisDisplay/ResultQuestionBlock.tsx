/**
 * ResultQuestionBlock — renders findings for a single question within a method section.
 *
 * Content order (reading contract):
 *   1. Question title (h4, truncated)
 *   2. Charts (hero, no preamble)
 *   3. Secondary stats (mean + n, below charts)
 *   4. Plain language summary (muted caption)
 *   5. Significance verdict
 *   6. Data tables (collapsed)
 *   7. Finding cards (collapsed)
 */

import { useState, useMemo } from 'react'
import { FindingCard } from './FindingCard'
import { PlainLanguageCard } from './PlainLanguageCard'
import { DataTable } from './DataTable'
import { ChartContainer } from '../Charts/ChartContainer'
import { truncateLabel } from '../../engine/chartDefaults'
import type { QuestionGroupData } from '../../results/groupFindings'

interface ResultQuestionBlockProps {
  group: QuestionGroupData
  defaultOpen: boolean
  collapsible: boolean
  /** When true (non-sig toggle ON), render with muted treatment */
  mutedNonSig?: boolean
}

/** Try to extract mean and n from the first finding's detail JSON */
function extractSecondaryStats(group: QuestionGroupData): { mean: number | null; n: number | null } {
  for (const f of group.findings) {
    try {
      const detail = JSON.parse(f.detail)
      // FrequencyPlugin: detail is items array, finding has mean/n in summary
      // DescriptivesPlugin: detail is DescriptiveStats object with mean, n
      // DescriptivesSummaryPlugin: detail is rows array with mean, n per row
      if (typeof detail === 'object' && detail !== null) {
        const mean = detail.mean ?? detail.stats?.[0]?.mean ?? null
        const n = detail.n ?? detail.stats?.[0]?.n ?? null
        if (mean !== null || n !== null) return { mean: typeof mean === 'number' ? mean : null, n: typeof n === 'number' ? n : null }
      }
      // Array of items (frequency): try to extract n from the finding summary
      if (Array.isArray(detail)) {
        const nMatch = f.summary.match(/n\s*=\s*(\d+)/)
        const meanMatch = f.summary.match(/Mean\s*=\s*([\d.]+)/)
        return {
          mean: meanMatch ? parseFloat(meanMatch[1]) : null,
          n: nMatch ? parseInt(nMatch[1], 10) : null,
        }
      }
    } catch {
      // detail is not valid JSON — skip
    }
  }
  return { mean: null, n: null }
}

export function ResultQuestionBlock({ group, defaultOpen, collapsible, mutedNonSig }: ResultQuestionBlockProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [tablesOpen, setTablesOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const displayLabel = truncateLabel(group.label, 60)

  const { mean, n } = useMemo(() => extractSecondaryStats(group), [group])

  // Best summary language: prefer summaryLanguage from highest-weight significant finding
  const summaryText = useMemo(() => {
    const sigFinding = group.findings.find((f) => f.significant)
    const bestFinding = sigFinding ?? group.findings[0]
    return bestFinding?.summaryLanguage || group.plainLanguage
  }, [group])

  // Significance verdict
  const significantFindings = useMemo(
    () => group.findings.filter((f) => f.significant),
    [group]
  )
  const verdictFinding = useMemo(() => {
    if (significantFindings.length === 0) return null
    // Pick highest narrativeWeight, fall back to first
    return [...significantFindings].sort((a, b) => (b.narrativeWeight ?? 0) - (a.narrativeWeight ?? 0))[0]
  }, [significantFindings])

  const headerClass = [
    'rqb-header',
    !group.primarySignificant ? 'rqb-header-ns' : '',
    collapsible ? 'rqb-header-clickable' : '',
  ].filter(Boolean).join(' ')

  const blockClass = [
    'result-question-block',
    !group.primarySignificant ? 'rqb-ns' : '',
    mutedNonSig ? 'rqb-muted' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={blockClass}>
      {/* 1. Question title */}
      <div
        className={headerClass}
        onClick={collapsible ? () => setOpen(!open) : undefined}
      >
        <h4 className="rqb-title" title={group.label}>{displayLabel}</h4>
        {collapsible && (
          <span className="rqb-toggle">{open ? '▾' : '▸'}</span>
        )}
      </div>

      {(open || !collapsible) && (
        <div className="rqb-body">
          {/* 2. Charts — hero, no preamble */}
          {group.charts.length > 0 && (
            <div className="rqb-charts">
              {group.charts.map((chart) => (
                <ChartContainer key={chart.id} chart={chart} />
              ))}
            </div>
          )}

          {/* 3. Secondary stats (mean + n) */}
          {(mean !== null || n !== null) && (
            <div className="rqb-secondary-stats">
              {mean !== null && <span>Mean: {mean.toFixed(1)}</span>}
              {n !== null && <span>n={n}</span>}
            </div>
          )}

          {/* 4. Plain language summary (muted caption) */}
          {summaryText && (
            <div className="rqb-plain-language-muted">
              <PlainLanguageCard text={summaryText} />
            </div>
          )}

          {/* 5. Significance verdict */}
          {verdictFinding ? (
            <div className="rqb-verdict rqb-verdict--significant">
              <strong>{verdictFinding.summaryLanguage}</strong>
              {verdictFinding.effectLabel && (
                <span className="rqb-effect-label">{verdictFinding.effectLabel}</span>
              )}
              <button className="rqb-stats-toggle" onClick={() => setStatsOpen(!statsOpen)}>
                {statsOpen ? '− Statistical details' : '+ Statistical details'}
              </button>
            </div>
          ) : (
            mutedNonSig && (
              <div className="rqb-verdict rqb-verdict--ns">
                No significant effect found
              </div>
            )
          )}

          {/* 6. Data tables (collapsed by default) */}
          {group.tables.length > 0 && (
            <div className="rqb-tables-section">
              <button className="rqb-stats-toggle" onClick={() => setTablesOpen(!tablesOpen)}>
                {tablesOpen ? '− Data tables' : `+ Data tables (${group.tables.length})`}
              </button>
              {tablesOpen && (
                <div className="rqb-tables">
                  {group.tables.map((table) => (
                    <div key={table.id} className="rqb-table-block">
                      <h5 className="rqb-table-title">{table.title}</h5>
                      <DataTable columns={table.columns} rows={table.rows} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 7. Finding cards (collapsed by default, shown via verdict toggle) */}
          {statsOpen && (
            <div className="rqb-findings">
              {group.findings.map((f) => (
                <FindingCard
                  key={f.id}
                  title={f.title}
                  summary={f.summary}
                  significant={f.significant}
                  pValue={f.pValue}
                  effectSize={f.effectSize}
                  effectLabel={f.effectLabel}
                  flags={(f as any).flags}
                  verificationResults={f.verificationResults}
                  subgroupContext={f.subgroupContext}
                  weightedBy={f.weightedBy}
                  crossType={f.crossType}
                  stepId={f.stepId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
