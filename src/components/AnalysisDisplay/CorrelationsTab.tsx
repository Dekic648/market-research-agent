/**
 * CorrelationsTab — Tab IV: interactive correlation matrix and pair list.
 *
 * Click a column header or cell to highlight that question's row + column
 * and filter the pair list to its correlates.
 */

import { useMemo, useState } from 'react'
import type { Finding } from '../../types/dataTypes'

interface CorrelationsTabProps {
  findings: Finding[]
  showNonSig: boolean
}

interface CorrelationPair {
  colA: string
  colB: string
  r: number
  significant: boolean
  summaryLanguage: string
  redundancyFlag: boolean
  method: 'pearson' | 'spearman' | 'kendall'
}

/** Parse correlation findings into structured pairs */
function extractPairs(findings: Finding[]): CorrelationPair[] {
  return findings
    .filter((f) => f.stepId === 'correlation' && !f.suppressed)
    .map((f) => {
      const cols = f.sourceColumns ?? []
      let colA = cols[0] ?? ''
      let colB = cols[1] ?? ''
      if (!colA || !colB) {
        const match = f.title.match(/^(.+?)\s*[↔×]\s*(.+?):/u)
        if (match) {
          colA = match[1].trim()
          colB = match[2].trim()
        }
      }
      // Parse redundancyFlag and method from detail JSON
      let redundancyFlag = false
      let method: 'pearson' | 'spearman' | 'kendall' = 'pearson'
      try {
        const detail = JSON.parse(f.detail)
        redundancyFlag = detail.redundancyFlag === true
        if (detail.method === 'kendall' || detail.method === 'spearman') method = detail.method
      } catch { /* ignore */ }

      return {
        colA,
        colB,
        r: f.effectSize ?? 0,
        significant: f.significant,
        summaryLanguage: f.summaryLanguage,
        redundancyFlag,
        method,
      }
    })
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
}

/** Get all unique column names from pairs */
function getUniqueColumns(pairs: CorrelationPair[]): string[] {
  const set = new Set<string>()
  for (const p of pairs) {
    if (p.colA) set.add(p.colA)
    if (p.colB) set.add(p.colB)
  }
  return Array.from(set)
}

/** Get r value for a pair (either direction) */
function getR(pairs: CorrelationPair[], a: string, b: string): number | null {
  const pair = pairs.find((p) =>
    (p.colA === a && p.colB === b) || (p.colA === b && p.colB === a)
  )
  return pair ? pair.r : null
}

/** Map r value to a background color */
function rToColor(r: number): string {
  const abs = Math.min(1, Math.abs(r))
  const alpha = Math.round(abs * 60 + 10)
  if (r > 0) return `rgba(29, 158, 117, ${alpha / 100})`
  if (r < 0) return `rgba(226, 75, 74, ${alpha / 100})`
  return 'transparent'
}

/** Truncate column name for matrix header */
function truncateCol(name: string, max = 20): string {
  if (name.length <= max) return name
  return name.slice(0, max - 1).trimEnd() + '…'
}

export function CorrelationsTab({ findings, showNonSig }: CorrelationsTabProps) {
  const pairs = useMemo(() => extractPairs(findings), [findings])
  const columns = useMemo(() => getUniqueColumns(pairs), [pairs])
  const [selectedCol, setSelectedCol] = useState<string | null>(null)

  if (pairs.length === 0) {
    return (
      <div className="results-empty-tab">
        No correlations were computed. Add more than one rating question to see relationships.
      </div>
    )
  }

  const toggleCol = (col: string) => setSelectedCol(col === selectedCol ? null : col)

  // Filter pair list when a column is selected
  const basePairs = showNonSig ? pairs : pairs.filter((p) => p.significant)
  const displayPairs = selectedCol
    ? basePairs.filter((p) => p.colA === selectedCol || p.colB === selectedCol)
    : basePairs

  const isHighlighted = (rowCol: string, colCol: string) =>
    selectedCol !== null && (rowCol === selectedCol || colCol === selectedCol)

  const isHeaderSelected = (col: string) => col === selectedCol

  return (
    <div className="correlations-tab">
      {/* Correlation matrix */}
      {columns.length > 1 && (
        <div className="corr-matrix-wrapper" style={{ overflowX: 'auto', marginBottom: 24 }}>
          <table className="corr-matrix">
            <thead>
              <tr>
                <th></th>
                {columns.map((col) => (
                  <th
                    key={col}
                    title={col}
                    onClick={() => toggleCol(col)}
                    style={{
                      fontSize: '0.75rem',
                      maxWidth: 100,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      fontWeight: isHeaderSelected(col) ? 700 : 400,
                      borderBottom: isHeaderSelected(col) ? '2px solid var(--color-primary, #378add)' : undefined,
                    }}
                  >
                    {truncateCol(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((rowCol) => (
                <tr key={rowCol}>
                  <td
                    title={rowCol}
                    onClick={() => toggleCol(rowCol)}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: isHeaderSelected(rowCol) ? 700 : 600,
                      maxWidth: 140,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      borderLeft: isHeaderSelected(rowCol) ? '2px solid var(--color-primary, #378add)' : undefined,
                    }}
                  >
                    {truncateCol(rowCol, 25)}
                  </td>
                  {columns.map((colCol) => {
                    if (rowCol === colCol) {
                      return (
                        <td
                          key={colCol}
                          onClick={() => toggleCol(rowCol)}
                          style={{
                            background: '#e8e6df',
                            textAlign: 'center',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            boxShadow: isHighlighted(rowCol, colCol) ? 'inset 0 0 0 2px var(--color-primary, #378add)' : undefined,
                          }}
                        >
                          —
                        </td>
                      )
                    }
                    const r = getR(pairs, rowCol, colCol)
                    const highlighted = isHighlighted(rowCol, colCol)
                    return (
                      <td
                        key={colCol}
                        onClick={() => toggleCol(rowCol === selectedCol ? colCol : rowCol)}
                        style={{
                          background: r !== null ? rToColor(r) : 'transparent',
                          textAlign: 'center',
                          fontSize: '0.75rem',
                          fontWeight: r !== null && Math.abs(r) > 0.5 ? 700 : 400,
                          cursor: 'pointer',
                          boxShadow: highlighted ? 'inset 0 0 0 2px var(--color-primary, #378add)' : undefined,
                        }}
                        title={r !== null ? `${rowCol} × ${colCol}: r = ${r.toFixed(3)}` : ''}
                      >
                        {r !== null ? r.toFixed(2) : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="corr-matrix-legend">
            Pearson r used for continuous pairs · Kendall τ for ordinal pairs
          </div>
        </div>
      )}

      {/* Pair list header */}
      <div className="corr-pair-list">
        {selectedCol && (
          <div className="corr-selection-header">
            <span className="corr-selection-label">Correlates of: <strong>{selectedCol}</strong></span>
            <button className="corr-clear-btn" onClick={() => setSelectedCol(null)}>
              Clear selection
            </button>
          </div>
        )}

        {displayPairs.map((pair, i) => (
          <div
            key={`${pair.colA}_${pair.colB}_${i}`}
            className={`corr-pair ${pair.significant ? '' : 'corr-pair-ns'}`}
          >
            <span className="corr-pair-label">
              {pair.colA} ↔ {pair.colB}
              <span className="corr-method-badge">{pair.method === 'kendall' ? 'Kendall' : pair.method === 'spearman' ? 'Spearman' : 'Pearson'}</span>
            </span>
            {pair.redundancyFlag && (
              <span className="corr-redundancy-flag">&#9888; Near-duplicate columns</span>
            )}
            <span className="corr-pair-summary">{pair.summaryLanguage}</span>
          </div>
        ))}

        {displayPairs.length === 0 && selectedCol && (
          <div className="results-ns-hint">No correlations found for {selectedCol}.</div>
        )}

        {!selectedCol && !showNonSig && pairs.length > basePairs.length && (
          <div className="results-ns-hint">
            {pairs.length - basePairs.length} non-significant correlations hidden
          </div>
        )}
      </div>
    </div>
  )
}
