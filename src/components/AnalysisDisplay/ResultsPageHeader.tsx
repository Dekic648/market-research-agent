/**
 * ResultsPageHeader — top bar for grouped results page.
 * Shows total finding count, collapse/expand toggle, and Build Report CTA.
 */

interface ResultsPageHeaderProps {
  totalFindings: number
  completedPlugins: number
  durationMs: number
  allCollapsed: boolean
  onToggleAll: () => void
}

export function ResultsPageHeader({
  totalFindings,
  completedPlugins,
  durationMs,
  allCollapsed,
  onToggleAll,
}: ResultsPageHeaderProps) {
  return (
    <div className="results-page-header card">
      <div className="results-page-header-left">
        <h2>Analysis Complete</h2>
        <div className="results-page-badges">
          <span className="badge badge-teal">{completedPlugins} analyses</span>
          <span className="badge badge-amber">{totalFindings} findings</span>
          <span className="badge badge-purple">{Math.round(durationMs)}ms</span>
        </div>
      </div>
      <div className="results-page-header-right">
        <button className="btn btn-secondary btn-sm" onClick={onToggleAll}>
          {allCollapsed ? 'Expand all' : 'Collapse all'}
        </button>
      </div>
    </div>
  )
}
