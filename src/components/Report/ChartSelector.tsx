/**
 * ChartSelector — pick which charts to include in the report.
 */

import { useChartStore } from '../../stores/chartStore'
import type { ChartConfig } from '../../types/dataTypes'
import './Report.css'

interface ChartSelectorProps {
  onIncludeChart: (chartId: string) => void
  includedIds: Set<string>
}

export function ChartSelector({ onIncludeChart, includedIds }: ChartSelectorProps) {
  const configs = useChartStore((s) => s.configs)
  const charts = Object.values(configs)

  if (charts.length === 0) {
    return (
      <div className="chart-selector">
        <h3>Charts</h3>
        <p className="empty-message">No charts generated yet.</p>
      </div>
    )
  }

  return (
    <div className="chart-selector">
      <h3>Charts ({charts.length})</h3>
      <div className="chart-grid">
        {charts.map((chart) => (
          <div
            key={chart.id}
            className={`chart-thumb ${includedIds.has(chart.id) ? 'included' : ''}`}
            onClick={() => onIncludeChart(chart.id)}
          >
            <span className="badge badge-purple">{chart.type}</span>
            <span className="chart-thumb-title">
              {String(chart.edits.title ?? (chart.layout as any)?.title?.text ?? chart.type ?? '')}
            </span>
            <span className="chart-thumb-step">{chart.stepId}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
