/**
 * DataTable — sortable results table for analysis output.
 */

import { useState, useMemo } from 'react'
import './AnalysisDisplay.css'

interface DataTableProps {
  columns: Array<{ key: string; label: string; numeric?: boolean }>
  rows: Array<Record<string, string | number | null>>
}

export function DataTable({ columns, rows }: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${col.numeric ? 'num-col' : ''} sortable`}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="sort-arrow">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, ri) => (
            <tr key={ri}>
              {columns.map((col) => {
                const val = row[col.key]
                return (
                  <td key={col.key} className={col.numeric ? 'num-col' : ''}>
                    {val === null || val === undefined
                      ? '—'
                      : typeof val === 'number'
                        ? val.toFixed(3)
                        : val}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
