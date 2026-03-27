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
          <span className="metric-value">{safeRender(m.value)}</span>
          <span className="metric-label">{String(m.label)}</span>
        </div>
      ))}
    </div>
  )
}

function safeRender(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return formatMetric(v)
  if (typeof v === 'string') return v
  // Guard against objects being passed as metric values
  return String(v)
}

function formatMetric(n: number): string {
  if (isNaN(n)) return '—'
  if (Number.isInteger(n)) return String(n)
  if (Math.abs(n) < 0.001 && n !== 0) return n.toExponential(2)
  return n.toFixed(3)
}
