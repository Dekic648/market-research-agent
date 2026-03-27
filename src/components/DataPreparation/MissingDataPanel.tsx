/**
 * MissingDataPanel — MANDATORY step before analysis.
 *
 * Shows per-variable missing %, Little's MCAR result,
 * and forces user to declare a strategy.
 */

import { useMemo } from 'react'
import type { ColumnDefinition } from '../../types/dataTypes'
import type { MissingDataStrategy, MissingDataSummary, LittlesMCARResult } from '../../preparation/types'
import { computeMissingDiagnostics, littlesMCARTest } from '../../preparation/missingData'
import './PrepPanels.css'

interface MissingDataPanelProps {
  columns: ColumnDefinition[]
  strategy: MissingDataStrategy | null
  onStrategyChange: (strategy: MissingDataStrategy) => void
}

export function MissingDataPanel({ columns, strategy, onStrategyChange }: MissingDataPanelProps) {
  const diagnostics = useMemo(() => computeMissingDiagnostics(columns), [columns])
  const mcar = useMemo(
    () => (diagnostics.totalMissing > 0 ? littlesMCARTest(columns) : null),
    [columns, diagnostics.totalMissing]
  )

  const hasMissing = diagnostics.totalMissing > 0

  return (
    <div className="prep-panel">
      <div className="prep-panel-header">
        <h3>Missing Data {!strategy && <span className="required-tag">Required</span>}</h3>
      </div>

      {!hasMissing ? (
        <div className="prep-panel-body">
          <div className="no-missing">No missing values detected. Select any strategy to continue.</div>
        </div>
      ) : (
        <div className="prep-panel-body">
          {/* Summary bar */}
          <div className="missing-summary">
            <span>{diagnostics.totalMissing} missing cells ({diagnostics.pctMissing.toFixed(1)}%)</span>
            {diagnostics.variablesAbove20pct.length > 0 && (
              <span className="badge badge-amber">
                {diagnostics.variablesAbove20pct.length} variable(s) &gt; 20% missing
              </span>
            )}
          </div>

          {/* Per-variable bars */}
          <div className="missing-bars">
            {diagnostics.perColumn
              .filter((c) => c.nMissing > 0)
              .sort((a, b) => b.pctMissing - a.pctMissing)
              .slice(0, 15)
              .map((c) => (
                <div key={c.columnId} className="missing-bar-row">
                  <span className="missing-bar-label">{c.columnName}</span>
                  <div className="missing-bar-track">
                    <div
                      className={`missing-bar-fill ${c.pctMissing > 20 ? 'high' : ''}`}
                      style={{ width: `${Math.min(c.pctMissing, 100)}%` }}
                    />
                  </div>
                  <span className="missing-bar-pct">{c.pctMissing.toFixed(1)}%</span>
                </div>
              ))}
          </div>

          {/* MCAR test result */}
          {mcar && mcar.interpretation !== 'insufficient_data' && (
            <div className={`mcar-result ${mcar.interpretation === 'not_MCAR' ? 'mcar-warning' : 'mcar-ok'}`}>
              <strong>Little's MCAR test:</strong>{' '}
              {mcar.interpretation === 'MCAR'
                ? `Missingness appears random (p = ${mcar.p.toFixed(3)}). Any strategy is appropriate.`
                : `Missingness is NOT random (p = ${mcar.p.toFixed(3)}). Listwise deletion may introduce bias — consider mean imputation.`}
            </div>
          )}
        </div>
      )}

      {/* Strategy selection */}
      <div className="strategy-select">
        {(['listwise', 'pairwise', 'mean_imputation'] as MissingDataStrategy[]).map((s) => (
          <button
            key={s}
            className={`strategy-btn ${strategy === s ? 'selected' : ''}`}
            onClick={() => onStrategyChange(s)}
          >
            <span className="strategy-name">
              {s === 'listwise' ? 'Listwise deletion' : s === 'pairwise' ? 'Pairwise deletion' : 'Mean imputation'}
            </span>
            <span className="strategy-desc">
              {s === 'listwise'
                ? 'Remove rows with any missing value'
                : s === 'pairwise'
                  ? 'Use available data per analysis'
                  : 'Replace missing with column mean'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
