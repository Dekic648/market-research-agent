/**
 * ResultQuestionBlock — renders findings for a single question within a method section.
 *
 * Content order:
 *   1. Interpretation card (green, prominent)
 *   2. Charts (hero)
 *   3. Tables (crosstab %, pairwise comparisons)
 *   4. Plain language summary
 *   5. Findings
 */

import { useState } from 'react'
import { FindingCard } from './FindingCard'
import { PlainLanguageCard } from './PlainLanguageCard'
import { DataTable } from './DataTable'
import { ChartContainer } from '../Charts/ChartContainer'
import type { QuestionGroupData } from '../../results/groupFindings'

interface ResultQuestionBlockProps {
  group: QuestionGroupData
  defaultOpen: boolean
  collapsible: boolean
}

export function ResultQuestionBlock({ group, defaultOpen, collapsible }: ResultQuestionBlockProps) {
  const [open, setOpen] = useState(defaultOpen)

  const headerClass = [
    'rqb-header',
    !group.primarySignificant ? 'rqb-header-ns' : '',
    collapsible ? 'rqb-header-clickable' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={`result-question-block ${!group.primarySignificant ? 'rqb-ns' : ''}`}>
      <div
        className={headerClass}
        onClick={collapsible ? () => setOpen(!open) : undefined}
      >
        <h4 className="rqb-title">{group.label}</h4>
        {!group.primarySignificant && (
          <span className="rqb-ns-badge">not significant</span>
        )}
        {collapsible && (
          <span className="rqb-toggle">{open ? '▾' : '▸'}</span>
        )}
      </div>

      {(open || !collapsible) && (
        <div className="rqb-body">
          {/* Interpretation card — green, prominent */}
          {group.interpretationCard && (
            <div className="rqb-interpretation-card">
              {group.interpretationCard}
            </div>
          )}

          {/* Hero chart */}
          {group.charts.length > 0 && (
            <div className="rqb-charts">
              {group.charts.map((chart) => (
                <ChartContainer key={chart.id} chart={chart} />
              ))}
            </div>
          )}

          {/* Structured tables (crosstab %, pairwise comparisons) */}
          {group.tables.length > 0 && (
            <div className="rqb-tables">
              {group.tables.map((table) => (
                <div key={table.id} className="rqb-table-block">
                  <h5 className="rqb-table-title">{table.title}</h5>
                  <DataTable columns={table.columns} rows={table.rows} />
                </div>
              ))}
            </div>
          )}

          {/* Plain language summary */}
          {group.plainLanguage && (
            <PlainLanguageCard text={group.plainLanguage} />
          )}

          {/* Findings */}
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
        </div>
      )}
    </div>
  )
}
