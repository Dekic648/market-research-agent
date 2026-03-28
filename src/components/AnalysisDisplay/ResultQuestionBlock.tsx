/**
 * ResultQuestionBlock — renders findings for a single question within a method section.
 *
 * Content order: chart (hero) → plain language → findings → stats details.
 * Collapsibility depends on section size and significance.
 */

import { useState } from 'react'
import { FindingCard } from './FindingCard'
import { PlainLanguageCard } from './PlainLanguageCard'
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
          {/* Hero chart */}
          {group.charts.length > 0 && (
            <div className="rqb-charts">
              {group.charts.map((chart) => (
                <ChartContainer key={chart.id} chart={chart} />
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
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
