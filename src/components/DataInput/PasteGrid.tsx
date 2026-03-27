/**
 * PasteGrid — paste area + data grid preview.
 *
 * User pastes data from Excel/Sheets/CSV. The component:
 * 1. Captures the paste event
 * 2. Passes raw text to ParserRegistry.parse()
 * 3. Renders the parsed data as a scrollable grid
 */

import { useState, useCallback, useRef } from 'react'
import type { PastedData } from '../../parsers/adapters/PasteGridAdapter'
import './PasteGrid.css'

interface PasteGridProps {
  onDataParsed: (data: PastedData) => void
  parsedData: PastedData | null
}

export function PasteGrid({ onDataParsed, parsedData }: PasteGridProps) {
  const [rawText, setRawText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData.getData('text/plain')
      if (!text.trim()) return

      e.preventDefault()
      setRawText(text)

      // Lazy import to avoid circular deps at module level
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
              {columns.map((col) => (
                <th key={col.id} title={col.name}>
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.min(nRows, maxPreviewRows) }, (_, rowIdx) => (
              <tr key={rowIdx}>
                <td className="row-num">{rowIdx + 1}</td>
                {columns.map((col) => {
                  const val = col.values[rowIdx]
                  return (
                    <td
                      key={col.id}
                      className={val === null ? 'cell-null' : typeof val === 'number' ? 'cell-num' : 'cell-str'}
                    >
                      {val === null ? '' : String(val)}
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
    </div>
  )
}
