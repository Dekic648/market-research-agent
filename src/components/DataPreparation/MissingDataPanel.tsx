/**
 * MissingDataPanel — displays how null values will be handled
 * based on column classifications (nullMeaning).
 *
 * For columns with genuine missingness (nullMeaning: 'missing'),
 * offers MICE imputation as an optional enhancement.
 */

import { useState, useMemo, useCallback } from 'react'
import type { ColumnDefinition, NullMeaning } from '../../types/dataTypes'
import { computeMissingDiagnostics, littlesMCARTest, runMICEImputation, type MICEResult } from '../../preparation/missingData'
import './PrepPanels.css'

interface MissingDataPanelProps {
  columns: ColumnDefinition[]
  onImputationComplete?: (result: MICEResult) => void
}

export function MissingDataPanel({ columns, onImputationComplete }: MissingDataPanelProps) {
  // Only show 'missing' columns in diagnostics — not_chosen and not_asked are excluded
  const eligibleColumns = useMemo(
    () => columns.filter((c) =>
      c.type !== 'checkbox' && c.type !== 'multi_assigned'
      && (c.nullMeaning === 'missing' || c.nullMeaning === undefined)
    ),
    [columns]
  )
  const diagnostics = useMemo(() => computeMissingDiagnostics(eligibleColumns), [eligibleColumns])
  const mcar = useMemo(
    () => (diagnostics.totalMissing > 0 ? littlesMCARTest(eligibleColumns) : null),
    [eligibleColumns, diagnostics.totalMissing]
  )

  const hasMissing = diagnostics.totalMissing > 0

  // Columns eligible for MICE: numeric, nullMeaning 'missing', > 5% missing
  const miceEligible = useMemo(
    () => eligibleColumns.filter((c) =>
      (c.type === 'rating' || c.type === 'behavioral' || c.type === 'matrix')
      && c.nMissing / c.nRows > 0.05
    ),
    [eligibleColumns]
  )

  const [miceOption, setMiceOption] = useState<'available' | 'mice'>('available')
  const [miceRunning, setMiceRunning] = useState(false)
  const [miceResult, setMiceResult] = useState<MICEResult | null>(null)

  const handleRunMICE = useCallback(() => {
    if (miceRunning) return
    setMiceRunning(true)

    // Run synchronously (MICE is fast for survey-sized data)
    try {
      const result = runMICEImputation(columns, columns[0]?.nRows ?? 0)
      setMiceResult(result)
      onImputationComplete?.(result)
    } finally {
      setMiceRunning(false)
    }
  }, [columns, miceRunning, onImputationComplete])

  // Determine which nullMeaning types are present
  const presentMeanings = useMemo(() => {
    const meanings = new Set<NullMeaning>()
    for (const col of columns) {
      if (col.nMissing > 0 && col.nullMeaning) meanings.add(col.nullMeaning)
    }
    return meanings
  }, [columns])

  // Check if any column already has imputedValues
  const hasExistingImputation = useMemo(
    () => columns.some((c) => c.imputedValues !== undefined),
    [columns]
  )

  return (
    <div className="prep-panel">
      <div className="prep-panel-header">
        <h3>Missing Data</h3>
      </div>

      {hasMissing && (
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
              <strong>Little&apos;s MCAR test:</strong>{' '}
              {mcar.interpretation === 'MCAR'
                ? `Missingness appears random (p = ${mcar.p.toFixed(3)}).`
                : `Missingness is NOT random (p = ${mcar.p.toFixed(3)}). Results may be affected by which respondents have missing values.`}
            </div>
          )}
        </div>
      )}

      {!hasMissing && (
        <div className="prep-panel-body">
          <div className="no-missing">No missing values detected in standard columns.</div>
        </div>
      )}

      {/* MICE imputation option — only when eligible columns exist */}
      {miceEligible.length > 0 && (
        <div className="mice-section">
          <h4>Missing values detected</h4>
          <p className="mice-desc">
            {miceEligible.length} column(s) have missing responses that may affect analysis accuracy:
          </p>
          <ul className="mice-column-list">
            {miceEligible.map((c) => (
              <li key={c.id}>{c.name} — {((c.nMissing / c.nRows) * 100).toFixed(0)}% missing</li>
            ))}
          </ul>

          <div className="mice-options">
            <label className={`mice-option ${miceOption === 'available' ? 'mice-option-selected' : ''}`}>
              <input type="radio" name="mice" value="available" checked={miceOption === 'available'}
                onChange={() => setMiceOption('available')} />
              <div>
                <strong>Use available responses only</strong>
                <span>Each analysis uses respondents who answered that question</span>
              </div>
            </label>
            <label className={`mice-option ${miceOption === 'mice' ? 'mice-option-selected' : ''}`}>
              <input type="radio" name="mice" value="mice" checked={miceOption === 'mice'}
                onChange={() => setMiceOption('mice')} />
              <div>
                <strong>Estimate missing values (Multiple Imputation)</strong>
                <span>Uses patterns in your data to estimate what missing values would likely have been. More accurate for regression and correlation analyses.</span>
              </div>
            </label>
          </div>

          {miceOption === 'mice' && !miceResult && !hasExistingImputation && (
            <button className="btn btn-primary" onClick={handleRunMICE} disabled={miceRunning}>
              {miceRunning ? 'Estimating missing values...' : 'Apply Multiple Imputation'}
            </button>
          )}

          {(miceResult || hasExistingImputation) && (
            <div className="mice-complete">
              {miceResult
                ? `Missing values estimated. ${miceResult.totalImputed} values imputed across ${miceResult.columnsImputed} columns.`
                : 'Multiple imputation has been applied.'}
              {miceOption === 'mice' && (
                <button className="btn btn-secondary btn-sm" onClick={handleRunMICE} disabled={miceRunning} style={{ marginLeft: 8 }}>
                  Re-run imputation
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* How empty cells are handled */}
      <div className="null-handling-info">
        <h4>How empty cells are handled</h4>

        {presentMeanings.has('not_chosen') && (
          <div className="null-handling-row">
            <span className="null-handling-icon">&#9745;</span>
            <div>
              <strong>Checkbox / multi-select columns</strong>
              <p>Empty = not selected. Counted in totals automatically.</p>
            </div>
          </div>
        )}

        {presentMeanings.has('not_asked') && (
          <div className="null-handling-row">
            <span className="null-handling-icon">&#8631;</span>
            <div>
              <strong>Conditional questions (routed)</strong>
              <p>Empty = respondent not shown this question. Analysis uses only respondents who received it.</p>
            </div>
          </div>
        )}

        {(presentMeanings.has('missing') || presentMeanings.size === 0) && (
          <div className="null-handling-row">
            <span className="null-handling-icon">?</span>
            <div>
              <strong>Other empty cells</strong>
              <p>Skipped in calculations. Each analysis uses available responses for that question.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
