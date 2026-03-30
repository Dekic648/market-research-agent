/**
 * Base Plotly config and layout — applied to all charts.
 */

export const baseConfig = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  toImageButtonOptions: {
    format: 'png',
    height: 600,
    width: 900,
    scale: 2,
  },
}

export const baseLayout = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, system-ui, sans-serif', size: 12 },
  margin: { l: 60, r: 20, t: 50, b: 80 },
}

/**
 * Truncate a label to maxLen characters, appending "…" if it exceeds.
 * Preserves the original value for hover tooltips.
 */
export function truncateLabel(label: string, maxLen = 40): string {
  if (!label) return label ?? ''
  const s = typeof label === 'string' ? label : String(label)
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1).trimEnd() + '…'
}

/**
 * Truncate an array of labels. Returns { display, full } so callers
 * can use display for axis ticks and full for hover text.
 */
export function truncateLabels(labels: string[], maxLen = 40): { display: string[]; full: string[] } {
  return {
    display: labels.map((l) => truncateLabel(l, maxLen)),
    full: labels,
  }
}

/** Standard color palette for market research charts */
export const brandColors = [
  '#378add', // blue
  '#1d9e75', // teal
  '#ef9f27', // amber
  '#e24b4a', // red
  '#7f77dd', // purple
  '#d85a30', // coral
  '#5dcaa5', // mint
  '#85b7eb', // light blue
  '#fac775', // light amber
  '#f09595', // light red
]
