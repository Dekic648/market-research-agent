/**
 * DataSummaryCard — read-only orientation card showing dataset overview.
 * Renders at the top of PrepWorkspace.
 */

import { useMemo } from 'react'
import { buildDataSummary, type DataSummary } from '../../report/schema/dataSummary'
import type { QuestionBlock } from '../../types/dataTypes'
import './PrepPanels.css'

interface DataSummaryCardProps {
  blocks: QuestionBlock[]
  rowCount: number
  availableAnalysisCount: number
}

export function DataSummaryCard({ blocks, rowCount, availableAnalysisCount }: DataSummaryCardProps) {
  const summary = useMemo(
    () => buildDataSummary(blocks, rowCount, availableAnalysisCount),
    [blocks, rowCount, availableAnalysisCount]
  )

  if (summary.families.length === 0) return null

  return (
    <div className="data-summary-card card">
      <h3 className="data-summary-title">Your dataset</h3>
      <div className="data-summary-respondents">{summary.rowCount} respondents</div>

      <div className="data-summary-families">
        {summary.families.map((family) => (
          <div key={family.label} className="data-summary-family">
            <div className="data-summary-family-header">
              <strong>{family.label}</strong> ({family.count})
            </div>
            {family.subgroups && family.subgroups.length > 0 && (
              <div className="data-summary-subgroups">
                {family.subgroups.map((sg, i) => (
                  <span key={i} className="data-summary-subgroup">{sg}</span>
                ))}
              </div>
            )}
            <div className="data-summary-preview">
              {family.preview.join(', ')}
              {family.count > 3 && '...'}
            </div>
            {family.dateRange && (
              <div className="data-summary-daterange">{family.dateRange}</div>
            )}
          </div>
        ))}
      </div>

      <div className="data-summary-footer">
        {summary.availableAnalysisCount} analysis types available
      </div>
    </div>
  )
}
