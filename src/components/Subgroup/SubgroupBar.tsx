/**
 * SubgroupBar — persistent filter bar between preparation and analysis.
 * Shows current base (all respondents or filtered subgroup).
 */

import { useState, useCallback, useMemo } from 'react'
import { useDatasetGraphStore } from '../../stores/datasetGraph'
import { computeEffectiveN, formatOperator } from '../../engine/subgroupFilter'
import type { ColumnDefinition, SubgroupFilter } from '../../types/dataTypes'
import './SubgroupBar.css'

interface SubgroupBarProps {
  nodeId: string
  allColumns: ColumnDefinition[]
  totalN: number
}

type SubgroupOperator = SubgroupFilter['operator']

const OPERATORS: Array<{ value: SubgroupOperator; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
]

export function SubgroupBar({ nodeId, allColumns, totalN }: SubgroupBarProps) {
  const activeSubgroup = useDatasetGraphStore((s) =>
    s.nodes.find((n) => n.id === nodeId)?.activeSubgroup ?? null
  )
  const setSubgroup = useDatasetGraphStore((s) => s.setSubgroup)
  const clearSubgroup = useDatasetGraphStore((s) => s.clearSubgroup)

  const [showForm, setShowForm] = useState(false)
  const [columnId, setColumnId] = useState(allColumns[0]?.id ?? '')
  const [operator, setOperator] = useState<SubgroupOperator>('lte')
  const [value, setValue] = useState('')
  const [label, setLabel] = useState('')

  const previewN = useMemo(() => {
    if (!columnId || !value.trim()) return null
    return computeEffectiveN(
      { id: '', label: '', columnId, operator, value: value.trim() },
      allColumns
    )
  }, [columnId, operator, value, allColumns])

  const handleApply = useCallback(() => {
    if (!columnId || !value.trim() || !label.trim()) return
    const effectiveN = computeEffectiveN(
      { id: '', label: label.trim(), columnId, operator, value: value.trim() },
      allColumns
    )
    const filter: SubgroupFilter = {
      id: `subgroup_${Date.now()}`,
      label: label.trim(),
      columnId,
      operator,
      value: value.trim(),
      effectiveN,
      source: 'manual',
    }
    setSubgroup(nodeId, filter)
    setShowForm(false)
  }, [nodeId, columnId, operator, value, label, allColumns, setSubgroup])

  const handleClear = useCallback(() => {
    clearSubgroup(nodeId)
  }, [nodeId, clearSubgroup])

  const colName = activeSubgroup
    ? allColumns.find((c) => c.id === activeSubgroup.columnId)?.name ?? ''
    : ''
  const opDisplay = activeSubgroup
    ? formatOperator(activeSubgroup.operator, activeSubgroup.value as number)
    : ''

  return (
    <div className="subgroup-bar">
      {activeSubgroup ? (
        <div className="subgroup-active">
          <span className="subgroup-badge">
            Base: {activeSubgroup.label} — {colName} {opDisplay} (n={activeSubgroup.effectiveN})
          </span>
          {activeSubgroup.source === 'auto' && (
            <span className="subgroup-auto-badge">auto-detected</span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleClear}>Clear</button>
        </div>
      ) : (
        <div className="subgroup-default">
          <span className="subgroup-badge subgroup-badge-default">
            Base: All respondents (n={totalN})
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(!showForm)}>
            + Define subgroup
          </button>
        </div>
      )}

      {showForm && !activeSubgroup && (
        <div className="subgroup-form">
          <div className="subgroup-form-row">
            <label>Filter:</label>
            <select value={columnId} onChange={(e) => setColumnId(e.target.value)} className="filter-select">
              {allColumns.map((col) => (
                <option key={col.id} value={col.id}>{col.name}</option>
              ))}
            </select>
            <select value={operator} onChange={(e) => setOperator(e.target.value as SubgroupOperator)} className="filter-select filter-op">
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            <input className="filter-input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" />
          </div>
          <div className="subgroup-form-row">
            <label>Label:</label>
            <input className="filter-input subgroup-label-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Detractors" />
            {previewN !== null && (
              <span className="subgroup-preview">Matches {previewN} of {totalN} respondents</span>
            )}
          </div>
          <div className="subgroup-form-actions">
            <button className="btn btn-primary btn-sm" onClick={handleApply} disabled={!label.trim() || !value.trim()}>Apply</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
