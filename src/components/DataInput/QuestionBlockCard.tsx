/**
 * QuestionBlockCard — one paste box for one question.
 *
 * User pastes data, sees a mini grid preview, sets the question type
 * and label. All columns in this paste become one QuestionBlock.
 */

import { useState, useCallback, useRef } from 'react'
import type { QuestionBlock, QuestionType } from '../../types/dataTypes'
import { PasteGridAdapter, type PastedData } from '../../parsers/adapters/PasteGridAdapter'
import { computeFingerprint } from '../../parsers/fingerprint'
import './QuestionBlockCard.css'

const QUESTION_TYPES: { value: QuestionType; label: string; desc: string }[] = [
  { value: 'rating', label: 'Rating / Likert', desc: 'Single scale item (1-5, 1-7, 1-10)' },
  { value: 'matrix', label: 'Matrix Grid', desc: 'Multiple items on the same scale' },
  { value: 'checkbox', label: 'Multi-select', desc: 'Check all that apply (0/1 per item)' },
  { value: 'radio', label: 'Single Choice', desc: 'One answer from a list' },
  { value: 'category', label: 'Category', desc: 'Demographic or grouping variable' },
  { value: 'behavioral', label: 'Numeric / Behavioral', desc: 'Continuous numeric data' },
  { value: 'verbatim', label: 'Open-ended Text', desc: 'Free text responses' },
]

interface QuestionBlockCardProps {
  block: QuestionBlock
  index: number
  onUpdate: (block: QuestionBlock) => void
  onRemove: () => void
}

export function QuestionBlockCard({ block, index, onUpdate, onRemove }: QuestionBlockCardProps) {
  const [rawText, setRawText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasParsedData = block.columns.length > 0

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData.getData('text/plain')
      if (!text.trim()) return
      e.preventDefault()
      setRawText(text)
      parseAndUpdate(text)
    },
    [block, onUpdate]
  )

  const parseAndUpdate = useCallback(
    (text: string) => {
      try {
        const parsed = PasteGridAdapter.parse(text)
        const columns = parsed.columns.map((col) => ({
          id: `${block.id}_${col.id}`,
          name: col.name,
          type: block.questionType,
          nRows: col.values.length,
          nMissing: col.values.filter((v) => v === null).length,
          rawValues: col.values,
          fingerprint: computeFingerprint(col.values, `${block.id}_${col.id}`),
          semanticDetectionCache: null,
          transformStack: [],
          sensitivity: 'anonymous' as const,
          declaredScaleRange: block.scaleRange ?? null,
        }))

        onUpdate({ ...block, columns })
      } catch (err) {
        console.error('Parse error:', err)
      }
    },
    [block, onUpdate]
  )

  const roleLabel = block.role === 'segment' ? 'SEGMENT' : block.role === 'weight' ? 'WEIGHT' : null
  const isOrdinal = block.questionType === 'rating' || block.questionType === 'matrix'

  return (
    <div className={`qb-card card ${block.role !== 'question' ? 'qb-card-special' : ''}`}>
      <div className="qb-header">
        <div className="qb-index">{roleLabel ?? index}</div>
        <input
          className="qb-label-input"
          type="text"
          value={block.label}
          onChange={(e) => onUpdate({ ...block, label: e.target.value })}
          placeholder={`Question ${index}`}
        />
        <div className="qb-header-actions">
          {block.role === 'question' && (
            <button
              className="qb-role-btn"
              onClick={() => onUpdate({ ...block, role: 'segment' })}
              title="Mark as segment variable"
            >
              Set as Segment
            </button>
          )}
          {block.role === 'segment' && (
            <button
              className="qb-role-btn qb-role-active"
              onClick={() => onUpdate({ ...block, role: 'question' })}
            >
              Segment ✓
            </button>
          )}
          <button className="qb-remove" onClick={onRemove} title="Remove">×</button>
        </div>
      </div>

      <div className="qb-type-row">
        <select
          className="qb-type-select"
          value={block.questionType}
          onChange={(e) => onUpdate({ ...block, questionType: e.target.value as QuestionType })}
        >
          {QUESTION_TYPES.map((qt) => (
            <option key={qt.value} value={qt.value}>{qt.label}</option>
          ))}
        </select>
        <span className="qb-type-desc">
          {QUESTION_TYPES.find((qt) => qt.value === block.questionType)?.desc}
        </span>
        {isOrdinal && (
          <div className="qb-scale-range">
            <input
              type="number"
              className="qb-scale-input"
              placeholder="Min"
              value={block.scaleRange?.[0] ?? ''}
              onChange={(e) => {
                const min = e.target.value ? Number(e.target.value) : undefined
                const max = block.scaleRange?.[1]
                onUpdate({
                  ...block,
                  scaleRange: min !== undefined && max !== undefined ? [min, max] : undefined,
                })
              }}
            />
            <span className="qb-scale-dash">–</span>
            <input
              type="number"
              className="qb-scale-input"
              placeholder="Max"
              value={block.scaleRange?.[1] ?? ''}
              onChange={(e) => {
                const max = e.target.value ? Number(e.target.value) : undefined
                const min = block.scaleRange?.[0]
                onUpdate({
                  ...block,
                  scaleRange: min !== undefined && max !== undefined ? [min, max] : undefined,
                })
              }}
            />
          </div>
        )}
      </div>

      {!hasParsedData ? (
        <div className="qb-paste-area">
          <textarea
            ref={textareaRef}
            placeholder="Paste data here (Ctrl+V / Cmd+V)"
            onPaste={handlePaste}
            onChange={(e) => setRawText(e.target.value)}
            value={rawText}
          />
          {rawText && (
            <button className="btn btn-secondary qb-parse-btn" onClick={() => parseAndUpdate(rawText)}>
              Parse
            </button>
          )}
        </div>
      ) : (
        <div className="qb-preview">
          <div className="qb-preview-stats">
            <span className="badge badge-teal">{block.columns[0]?.nRows ?? 0} rows</span>
            <span className="badge badge-purple">{block.columns.length} column{block.columns.length !== 1 ? 's' : ''}</span>
            {block.columns[0]?.nMissing > 0 && (
              <span className="badge badge-amber">{block.columns[0].nMissing} missing</span>
            )}
          </div>
          <div className="qb-preview-grid">
            <table>
              <thead>
                <tr>
                  {block.columns.slice(0, 8).map((col) => (
                    <th key={col.id} title={col.name}>{col.name}</th>
                  ))}
                  {block.columns.length > 8 && <th>+{block.columns.length - 8}</th>}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.min(5, block.columns[0]?.nRows ?? 0) }, (_, r) => (
                  <tr key={r}>
                    {block.columns.slice(0, 8).map((col) => (
                      <td key={col.id}>{col.rawValues[r] === null ? '' : String(col.rawValues[r])}</td>
                    ))}
                    {block.columns.length > 8 && <td>…</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="qb-clear-btn"
            onClick={() => {
              setRawText('')
              onUpdate({ ...block, columns: [] })
            }}
          >
            Clear &amp; re-paste
          </button>
        </div>
      )}
    </div>
  )
}
