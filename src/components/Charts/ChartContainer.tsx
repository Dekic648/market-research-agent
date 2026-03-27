/**
 * ChartContainer — renders a ChartConfig via Plotly.
 *
 * Rule: ChartStore holds configs only. Data comes from StepResult.
 * This component merges default config + user edits and renders.
 */

import { useMemo, lazy, Suspense } from 'react'
import { baseConfig, baseLayout } from '../../engine/chartDefaults'

const Plot = lazy(() => import('react-plotly.js'))
import type { ChartConfig, ChartEdits } from '../../types/dataTypes'
import './ChartContainer.css'

interface ChartContainerProps {
  chart: ChartConfig
  /** Override height (default 400) */
  height?: number
}

export function ChartContainer({ chart, height = 400 }: ChartContainerProps) {
  const mergedLayout = useMemo(() => {
    const layout: Record<string, unknown> = {
      ...baseLayout,
      ...chart.layout,
      autosize: true,
      height,
    }

    // Apply user edits
    const edits = chart.edits
    if (edits.title) {
      layout.title = { ...(layout.title as Record<string, unknown> ?? {}), text: edits.title }
    }
    if (edits.xAxisLabel) {
      layout.xaxis = { ...(layout.xaxis as Record<string, unknown> ?? {}), title: { text: edits.xAxisLabel } }
    }
    if (edits.yAxisLabel) {
      layout.yaxis = { ...(layout.yaxis as Record<string, unknown> ?? {}), title: { text: edits.yAxisLabel } }
    }

    return layout
  }, [chart.layout, chart.edits, height])

  const mergedConfig = useMemo(
    () => ({ ...baseConfig, ...chart.config }),
    [chart.config]
  )

  const data = useMemo(() => {
    // Chart data comes from plugins with mixed Plotly trace types.
    // Cast through any to avoid strict Plotly.Data union mismatches.
    const traces = chart.data as unknown[]

    if (chart.edits.colors && chart.edits.colors.length > 0) {
      return traces.map((trace: any, i) => {
        const color = chart.edits.colors![i % chart.edits.colors!.length]
        if (trace.marker) return { ...trace, marker: { ...trace.marker, color } }
        if (trace.line) return { ...trace, line: { ...trace.line, color } }
        return trace
      })
    }

    return traces
  }, [chart.data, chart.edits.colors])

  return (
    <div className="chart-container">
      <Suspense fallback={<div className="chart-loading">Loading chart...</div>}>
        <Plot
          data={data as Plotly.Data[]}
          layout={mergedLayout as Partial<Plotly.Layout>}
          config={mergedConfig as Partial<Plotly.Config>}
          useResizeHandler
          className="plotly-chart"
          style={{ width: '100%', height: `${height}px` }}
        />
      </Suspense>
    </div>
  )
}
