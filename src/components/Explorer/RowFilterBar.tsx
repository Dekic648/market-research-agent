/**
 * RowFilterBar — simple single-condition row filter for the explorer.
 * [Column ▼] [Operator ▼] [Value input]
 */

import { useState, useCallback } from 'react'
import { useSelectionStore, type FilterExpression } from '../../stores/selectionStore'
import type { ColumnDefinition } from '../../types/dataTypes'
import './ExplorerPanel.css'

interface RowFilterBarProps {
  allColumns: ColumnDefinition[]
  filteredCount: number
  totalCount: number
}

const OPERATORS: Array<{ value: FilterExpression['operator']; label: string }> = [
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '!=' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'contains', label: 'contains' },
]

export function RowFilterBar({ allColumns, filteredCount, totalCount }: RowFilterBarProps) {
  const rowFilter = useSelectionStore((s) => s.rowFilter)
  const setRowFilter = useSelectionStore((s) => s.setRowFilter)
  const clearRowFilter = useSelectionStore((s) => s.clearRowFilter)

  const [columnId, setColumnId] = useState(allColumns[0]?.id ?? '')
  const [operator, setOperator] = useState<FilterExpression['operator']>('equals')
  const [value, setValue] = useState('')

  const handleApply = useCallback(() => {
    if (!columnId || !value.trim()) return
    setRowFilter({ columnId, operator, value: value.trim() })
  }, [columnId, operator, value, setRowFilter])

  const handleClear = useCallback(() => {
    clearRowFilter()
    setValue('')
  }, [clearRowFilter])

  return (
    <div className="row-filter-bar">
      <div className="row-filter-controls">
        <select
          className="filter-select"
          value={columnId}
          onChange={(e) => setColumnId(e.target.value)}
        >
          {allColumns.map((col) => (
            <option key={col.id} value={col.id}>{col.name}</option>
          ))}
        </select>

        <select
          className="filter-select filter-op"
          value={operator}
          onChange={(e) => setOperator(e.target.value as FilterExpression['operator'])}
        >
          {OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>

        <input
          className="filter-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value..."
          onKeyDown={(e) => { if (e.key === 'Enter') handleApply() }}
        />

        <button className="btn btn-primary btn-sm" onClick={handleApply}>Filter</button>
        {rowFilter && (
          <button className="btn btn-secondary btn-sm" onClick={handleClear}>Clear</button>
        )}
      </div>

      {rowFilter && (
        <span className="filter-badge">
          Filtered: {filteredCount} of {totalCount} rows
        </span>
      )}
    </div>
  )
}
