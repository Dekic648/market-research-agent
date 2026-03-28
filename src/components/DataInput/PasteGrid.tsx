/**
 * PasteGrid — paste area + data grid preview with inline cell editing.
 *
 * User pastes data from Excel/Sheets/CSV. The component:
 * 1. Captures the paste event
 * 2. Passes raw text to ParserRegistry.parse()
 * 3. Renders the parsed data as a scrollable grid
 * 4. Supports double-click cell editing via SingleValueOverrideTransform
 */

import { useState, useCallback, useRef } from 'react'
import type { PastedData } from '../../parsers/adapters/PasteGridAdapter'
import type { ColumnDefinition } from '../../types/dataTypes'
import type { SingleValueOverrideTransform } from '../../types/transforms'
import './PasteGrid.css'

interface PasteGridProps {
  onDataParsed: (data: PastedData) => void
  parsedData: PastedData | null
  /** When provided, enables cell editing on ColumnDefinition columns */
  editableColumns?: ColumnDefinition[]
  onCellOverride?: (colId: string, transform: SingleValueOverrideTransform) => void
  onRemoveOverride?: (colId: string, transformId: string) => void
}

/** Count overrides for a column */
function countOverrides(col: ColumnDefinition): number {
  return col.transformStack.filter(
    (t) => t.type === 'singleValueOverride' && t.enabled
  ).length
}

/** Get the overridden value at a row index, or null if not overridden */
function getOverrideAtRow(col: ColumnDefinition, rowIdx: number): { value: number | string | null; transformId: string } | null {
  for (const t of col.transformStack) {
    if (t.type === 'singleValueOverride' && t.enabled) {
      const params = t.params as { rowIndex: number; newValue: number | string | null }
      if (params.rowIndex === rowIdx) {
        return { value: params.newValue, transformId: t.id }
      }
    }
  }
  return null
}

export function PasteGrid({ onDataParsed, parsedData, editableColumns, onCellOverride, onRemoveOverride }: PasteGridProps) {
  const [rawText, setRawText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [editingCell, setEditingCell] = useState<{ colId: string; rowIdx: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showOverrides, setShowOverrides] = useState<string | null>(null)

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData.getData('text/plain')
      if (!text.trim()) return

      e.preventDefault()
      setRawText(text)

      import('../../parsers/ParserRegistry').then(({ ParserRegistry }) => {
        try {
          const data = ParserRegistry.parse(text)
          onDataParsed(data)
        } catch (err) {
          console.error('Parse error:', err)
        }
      })
    },
    [onDataParsed]
  )

  const handleClear = useCallback(() => {
    setRawText('')
    onDataParsed(null as unknown as PastedData)
    if (textareaRef.current) textareaRef.current.value = ''
  }, [onDataParsed])

  const handleDoubleClick = useCallback((colId: string, rowIdx: number, currentValue: number | string | null) => {
    if (!editableColumns || !onCellOverride) return
    setEditingCell({ colId, rowIdx })
    setEditValue(currentValue === null ? '' : String(currentValue))
  }, [editableColumns, onCellOverride])

  const handleCellEditCommit = useCallback(() => {
    if (!editingCell || !editableColumns || !onCellOverride) return

    const col = editableColumns.find((c) => c.id === editingCell.colId)
    if (!col) return

    const originalValue = col.rawValues[editingCell.rowIdx] ?? null
    const newValue = editValue.trim() === '' ? null
      : !isNaN(Number(editValue)) ? Number(editValue)
      : editValue.trim()

    // Only create transform if value actually changed
    if (String(originalValue ?? '') !== String(newValue ?? '')) {
      const transform: SingleValueOverrideTransform = {
        id: `override_${editingCell.colId}_${editingCell.rowIdx}_${Date.now()}`,
        type: 'singleValueOverride',
        params: {
          rowIndex: editingCell.rowIdx,
          originalValue,
          newValue,
        },
        enabled: true,
        createdAt: Date.now(),
        createdBy: 'user',
        source: 'user',
      }
      onCellOverride(editingCell.colId, transform)
    }

    setEditingCell(null)
    setEditValue('')
  }, [editingCell, editValue, editableColumns, onCellOverride])

  const handleCellEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCellEditCommit()
    if (e.key === 'Escape') { setEditingCell(null); setEditValue('') }
  }, [handleCellEditCommit])

  // Empty state — show paste prompt
  if (!parsedData) {
    return (
      <div className="paste-grid card">
        <div className="paste-prompt">
          <textarea
            ref={textareaRef}
            className="paste-area"
            placeholder="Paste your survey data here (Ctrl+V / Cmd+V)&#10;&#10;Supports: Excel, Google Sheets, CSV, TSV"
            onPaste={handlePaste}
            onChange={(e) => setRawText(e.target.value)}
            value={rawText}
          />
          {rawText && !parsedData && (
            <button className="btn btn-primary parse-btn" onClick={() => {
              import('../../parsers/ParserRegistry').then(({ ParserRegistry }) => {
                try {
                  const data = ParserRegistry.parse(rawText)
                  onDataParsed(data)
                } catch (err) {
                  console.error('Parse error:', err)
                }
              })
            }}>
              Parse Data
            </button>
          )}
        </div>
      </div>
    )
  }

  // Data state — show grid
  const { columns, nRows, nCols } = parsedData
  const maxPreviewRows = 50

  return (
    <div className="paste-grid card">
      <div className="grid-toolbar">
        <div className="grid-stats">
          <span className="badge badge-teal">{nRows} rows</span>
          <span className="badge badge-purple">{nCols} columns</span>
          <span className="badge badge-amber">{parsedData.format.toUpperCase()}</span>
        </div>
        <button className="btn btn-secondary" onClick={handleClear}>
          Clear &amp; Re-paste
        </button>
      </div>

      <div className="grid-scroll">
        <table className="data-grid">
          <thead>
            <tr>
              <th className="row-num">#</th>
              {columns.map((col) => {
                const editCol = editableColumns?.find((ec) => ec.id === col.id)
                const overrideCount = editCol ? countOverrides(editCol) : 0
                return (
                  <th key={col.id} title={col.name}>
                    {col.name}
                    {overrideCount > 0 && (
                      <span
                        className="override-badge"
                        onClick={(e) => { e.stopPropagation(); setShowOverrides(showOverrides === col.id ? null : col.id) }}
                      >
                        {overrideCount} edit{overrideCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.min(nRows, maxPreviewRows) }, (_, rowIdx) => (
              <tr key={rowIdx}>
                <td className="row-num">{rowIdx + 1}</td>
                {columns.map((col) => {
                  const val = col.values[rowIdx]
                  const editCol = editableColumns?.find((ec) => ec.id === col.id)
                  const override = editCol ? getOverrideAtRow(editCol, rowIdx) : null
                  const displayVal = override ? override.value : val
                  const isEditing = editingCell?.colId === col.id && editingCell?.rowIdx === rowIdx

                  if (isEditing) {
                    return (
                      <td key={col.id} className="cell-editing">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellEditCommit}
                          onKeyDown={handleCellEditKeyDown}
                        />
                      </td>
                    )
                  }

                  return (
                    <td
                      key={col.id}
                      className={`${displayVal === null ? 'cell-null' : typeof displayVal === 'number' ? 'cell-num' : 'cell-str'}${override ? ' cell-overridden' : ''}`}
                      onDoubleClick={() => handleDoubleClick(col.id, rowIdx, val)}
                    >
                      {displayVal === null ? '' : String(displayVal)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {nRows > maxPreviewRows && (
          <div className="grid-truncated">
            Showing {maxPreviewRows} of {nRows} rows
          </div>
        )}
      </div>

      {/* Override list panel */}
      {showOverrides && editableColumns && onRemoveOverride && (() => {
        const col = editableColumns.find((c) => c.id === showOverrides)
        if (!col) return null
        const overrides = col.transformStack.filter(
          (t) => t.type === 'singleValueOverride' && t.enabled
        )
        if (overrides.length === 0) return null
        return (
          <div className="override-panel">
            <div className="override-panel-header">
              <strong>{col.name} overrides</strong>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowOverrides(null)}>Close</button>
            </div>
            {overrides.map((t) => {
              const p = t.params as { rowIndex: number; originalValue: number | string | null; newValue: number | string | null }
              return (
                <div key={t.id} className="override-row">
                  <span>Row {p.rowIndex + 1}: {String(p.originalValue ?? '(empty)')} → {String(p.newValue ?? '(empty)')}</span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onRemoveOverride(col.id, t.id)}
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}
