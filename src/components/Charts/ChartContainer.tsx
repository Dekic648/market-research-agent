/**
 * ChartContainer — renders a ChartConfig via Plotly.js directly.
 *
 * Uses Plotly.newPlot() with a div ref instead of react-plotly.js,
 * which is incompatible with React 19 (renders layout objects as
 * React children, causing error #306).
 */

import { useRef, useEffect, useMemo } from 'react'
import { baseConfig, baseLayout } from '../../engine/chartDefaults'
import type { ChartConfig } from '../../types/dataTypes'
import './ChartContainer.css'

interface ChartContainerProps {
  chart: ChartConfig
  height?: number
}

// Lazy-load Plotly.js — only fetched when first chart renders
let plotlyPromise: Promise<typeof import('plotly.js-dist-min')> | null = null
function getPlotly() {
  if (!plotlyPromise) {
    plotlyPromise = import('plotly.js-dist-min')
  }
  return plotlyPromise
}

export function ChartContainer({ chart, height = 400 }: ChartContainerProps) {
  const divRef = useRef<HTMLDivElement>(null)

  const mergedLayout = useMemo(() => {
    const layout: Record<string, unknown> = {
      ...baseLayout,
      ...chart.layout,
      autosize: true,
      height,
    }

    // Apply user edits
    if (chart.edits.title) layout.title = chart.edits.title
    if (chart.edits.xAxisLabel) {
      layout.xaxis = { ...(layout.xaxis as object ?? {}), title: chart.edits.xAxisLabel }
    }
    if (chart.edits.yAxisLabel) {
      layout.yaxis = { ...(layout.yaxis as object ?? {}), title: chart.edits.yAxisLabel }
    }

    return layout
  }, [chart.layout, chart.edits, height])

  const mergedConfig = useMemo(
    () => ({ ...baseConfig, ...chart.config, responsive: true }),
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

  useEffect(() => {
    const el = divRef.current
    if (!el) return

    let cancelled = false

    getPlotly().then((Plotly) => {
      if (cancelled || !divRef.current) return
      Plotly.newPlot(divRef.current, data as any, mergedLayout as any, mergedConfig as any)
    })

    return () => {
      cancelled = true
      if (el && (el as any).data) {
        getPlotly().then((Plotly) => Plotly.purge(el))
      }
    }
  }, [data, mergedLayout, mergedConfig])

  // Resize on container change
  useEffect(() => {
    const el = divRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      getPlotly().then((Plotly) => {
        if (el && (el as any).data) Plotly.Plots.resize(el as any)
      })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="chart-container">
      <div ref={divRef} style={{ width: '100%', height: `${height}px` }} />
    </div>
  )
}
