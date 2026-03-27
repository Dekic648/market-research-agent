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
