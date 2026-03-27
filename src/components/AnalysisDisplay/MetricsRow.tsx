/**
 * MetricsRow — key summary numbers for an analysis step.
 */

import './AnalysisDisplay.css'

interface Metric {
  label: string
  value: string | number
  highlight?: boolean
}

interface MetricsRowProps {
  metrics: Metric[]
}

export function MetricsRow({ metrics }: MetricsRowProps) {
  return (
    <div className="metrics-row">
      {metrics.map((m, i) => (
        <div key={i} className={`metric ${m.highlight ? 'metric-highlight' : ''}`}>
          <span className="metric-value">{typeof m.value === 'number' ? formatMetric(m.value) : m.value}</span>
          <span className="metric-label">{m.label}</span>
        </div>
      ))}
    </div>
  )
}

function formatMetric(n: number): string {
  if (Number.isInteger(n)) return String(n)
  if (Math.abs(n) < 0.001 && n !== 0) return n.toExponential(2)
  return n.toFixed(3)
}
