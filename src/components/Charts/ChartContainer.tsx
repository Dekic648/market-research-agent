/**
 * ChartContainer — renders a ChartConfig via Plotly.js directly.
 *
 * Uses Plotly.newPlot() with a div ref instead of react-plotly.js,
 * which is incompatible with React 19 (renders layout objects as
 * React children, causing error #306).
 */

import { useRef, useEffect, useMemo, useState } from 'react'
import { baseConfig, baseLayout } from '../../engine/chartDefaults'
import type { ChartConfig } from '../../types/dataTypes'

/** Read current theme colors from CSS custom properties */
function getThemeColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    text: style.getPropertyValue('--chart-text').trim() || '#1a1a18',
    bg: style.getPropertyValue('--chart-bg').trim() || '#ffffff',
    grid: style.getPropertyValue('--chart-grid').trim() || '#e8e6df',
  }
}
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

  // Watch for theme changes
  const [themeKey, setThemeKey] = useState(0)
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeKey((k) => k + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const mergedLayout = useMemo(() => {
    const theme = getThemeColors()

    const layout: Record<string, unknown> = {
      ...baseLayout,
      ...chart.layout,
      autosize: true,
      height,
      paper_bgcolor: theme.bg,
      plot_bgcolor: theme.bg,
      font: { family: 'Inter, system-ui, sans-serif', size: 12, color: theme.text },
    }

    // Set grid colors on axes
    const xaxis = { ...(layout.xaxis as Record<string, unknown> ?? {}) }
    const yaxis = { ...(layout.yaxis as Record<string, unknown> ?? {}) }
    xaxis.gridcolor = theme.grid
    xaxis.zerolinecolor = theme.grid
    yaxis.gridcolor = theme.grid
    yaxis.zerolinecolor = theme.grid
    layout.xaxis = xaxis
    layout.yaxis = yaxis

    // Apply user edits
    if (chart.edits.title) layout.title = chart.edits.title
    if (chart.edits.xAxisLabel) {
      (layout.xaxis as Record<string, unknown>).title = chart.edits.xAxisLabel
    }
    if (chart.edits.yAxisLabel) {
      (layout.yaxis as Record<string, unknown>).title = chart.edits.yAxisLabel
    }

    return layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart.layout, chart.edits, height, themeKey])

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
