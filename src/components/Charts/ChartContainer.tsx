/**
 * ChartContainer — renders a ChartConfig via Plotly.
 *
 * Rule: ChartStore holds configs only. Data comes from StepResult.
 * This component merges default config + user edits and renders.
 */

import { useMemo, lazy, Suspense } from 'react'
import { baseConfig, baseLayout } from '../../engine/chartDefaults'

const Plot = lazy(() => import('react-plotly.js'))
import type { ChartConfig } from '../../types/dataTypes'
import './ChartContainer.css'

interface ChartContainerProps {
  chart: ChartConfig
  height?: number
}

/**
 * Sanitize layout for react-plotly.js.
 *
 * react-plotly.js v2 renders layout.title as a React child if it's an object.
 * Plotly.js itself accepts { text: "..." } but react-plotly.js doesn't handle
 * this correctly and throws React error #306 (object as child).
 *
 * Fix: flatten all title objects to plain strings.
 */
function sanitizeLayout(layout: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...layout }

  // layout.title: { text: "..." } → "..."
  if (clean.title && typeof clean.title === 'object' && (clean.title as any).text) {
    clean.title = (clean.title as any).text
  }

  // layout.xaxis.title: { text: "..." } → "..."
  if (clean.xaxis && typeof clean.xaxis === 'object') {
    const xaxis = { ...(clean.xaxis as Record<string, unknown>) }
    if (xaxis.title && typeof xaxis.title === 'object' && (xaxis.title as any).text) {
      xaxis.title = (xaxis.title as any).text
    }
    clean.xaxis = xaxis
  }

  // layout.yaxis.title: { text: "..." } → "..."
  if (clean.yaxis && typeof clean.yaxis === 'object') {
    const yaxis = { ...(clean.yaxis as Record<string, unknown>) }
    if (yaxis.title && typeof yaxis.title === 'object' && (yaxis.title as any).text) {
      yaxis.title = (yaxis.title as any).text
    }
    clean.yaxis = yaxis
  }

  return clean
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
      layout.title = edits.title
    }
    if (edits.xAxisLabel) {
      const xaxis = { ...(layout.xaxis as Record<string, unknown> ?? {}) }
      xaxis.title = edits.xAxisLabel
      layout.xaxis = xaxis
    }
    if (edits.yAxisLabel) {
      const yaxis = { ...(layout.yaxis as Record<string, unknown> ?? {}) }
      yaxis.title = edits.yAxisLabel
      layout.yaxis = yaxis
    }

    return sanitizeLayout(layout)
  }, [chart.layout, chart.edits, height])

  const mergedConfig = useMemo(
    () => ({ ...baseConfig, ...chart.config }),
    [chart.config]
  )

  const data = useMemo(() => {
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
