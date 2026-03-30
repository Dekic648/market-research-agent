/**
 * CorrelationsTab — Tab IV: correlation matrix and pair list.
 */

import { useMemo } from 'react'
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
}

/** Parse correlation findings into structured pairs */
function extractPairs(findings: Finding[]): CorrelationPair[] {
  return findings
    .filter((f) => f.stepId === 'correlation' && !f.suppressed)
    .map((f) => {
      const cols = f.sourceColumns ?? []
      // Fall back to parsing title: "ColA ↔ ColB: r = 0.xxx"
      let colA = cols[0] ?? ''
      let colB = cols[1] ?? ''
      if (!colA || !colB) {
        const match = f.title.match(/^(.+?)\s*[↔×]\s*(.+?):/u)
        if (match) {
          colA = match[1].trim()
          colB = match[2].trim()
        }
      }
      return {
        colA,
        colB,
        r: f.effectSize ?? 0,
        significant: f.significant,
        summaryLanguage: f.summaryLanguage,
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
  const alpha = Math.round(abs * 60 + 10) // 10–70% opacity
  if (r > 0) return `rgba(29, 158, 117, ${alpha / 100})` // teal
  if (r < 0) return `rgba(226, 75, 74, ${alpha / 100})`  // red
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

  if (pairs.length === 0) {
    return (
      <div className="results-empty-tab">
        No correlations were computed. Add more than one rating question to see relationships.
      </div>
    )
  }

  const visiblePairs = showNonSig ? pairs : pairs.filter((p) => p.significant)

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
                  <th key={col} title={col} style={{ fontSize: '0.75rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {truncateCol(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((rowCol) => (
                <tr key={rowCol}>
                  <td title={rowCol} style={{ fontSize: '0.75rem', fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {truncateCol(rowCol, 25)}
                  </td>
                  {columns.map((colCol) => {
                    if (rowCol === colCol) {
                      return <td key={colCol} style={{ background: '#e8e6df', textAlign: 'center', fontSize: '0.75rem' }}>—</td>
                    }
                    const r = getR(pairs, rowCol, colCol)
                    return (
                      <td
                        key={colCol}
                        style={{
                          background: r !== null ? rToColor(r) : 'transparent',
                          textAlign: 'center',
                          fontSize: '0.75rem',
                          fontWeight: r !== null && Math.abs(r) > 0.5 ? 700 : 400,
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
        </div>
      )}

      {/* Pair list */}
      <div className="corr-pair-list">
        {visiblePairs.map((pair, i) => (
          <div
            key={`${pair.colA}_${pair.colB}_${i}`}
            className={`corr-pair ${pair.significant ? '' : 'corr-pair-ns'}`}
          >
            <span className="corr-pair-label">{pair.colA} ↔ {pair.colB}</span>
            <span className="corr-pair-summary">{pair.summaryLanguage}</span>
          </div>
        ))}
        {!showNonSig && pairs.length > visiblePairs.length && (
          <div className="results-ns-hint">
            {pairs.length - visiblePairs.length} non-significant correlations hidden
          </div>
        )}
      </div>
    </div>
  )
}
