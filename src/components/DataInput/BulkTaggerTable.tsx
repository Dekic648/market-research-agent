/**
 * BulkTaggerTable — compact table-based tagging for 8+ column datasets.
 *
 * Replaces the one-card-per-column flow when the dataset is large.
 * High-confidence auto-detections are pre-confirmed. Low-confidence
 * rows require individual review.
 */

import { useState, useCallback, useMemo } from 'react'
import type { QuestionBlock, QuestionType, NullMeaning } from '../../types/dataTypes'
import { TYPE_DESCRIPTIONS, SELECTABLE_TYPES } from './columnTypeDescriptions'
import './BulkTaggerTable.css'

interface BulkTaggerTableProps {
  blocks: QuestionBlock[]
  onUpdateBlock: (index: number, updated: QuestionBlock) => void
  onConfirmAll: () => void
}

// ============================================================
// Confidence scoring
// ============================================================

export function getDetectionConfidence(block: QuestionBlock): 'high' | 'low' {
  const fp = block.columns[0]?.fingerprint
  if (!fp) return 'low'

  if (block.questionType === 'checkbox') return 'high'
  if (block.questionType === 'timestamped') return 'high'
  if (block.questionType === 'verbatim') return 'high'
  if (block.questionType === 'behavioral' && fp.numericRatio > 0.95) return 'high'
  if (block.questionType === 'category' && fp.numericRatio < 0.05) return 'high'

  // Low confidence
  if (fp.nUnique <= 6 && fp.numericRatio > 0.8) return 'low'
  const pctMissing = fp.nMissing / fp.nRows
  if (pctMissing > 0.3) return 'low'

  return 'high'
}

// ============================================================
// Ambiguous name detection
// ============================================================

const AMBIGUOUS_NAME_PATTERNS = [
  /^[a-zA-Z]$/,
  /^col\d+$/i,
  /^field\d*$/i,
  /^value\d*$/i,
  /^data\d*$/i,
  /^var\d+$/i,
  /^\d+$/,
  /^column\d*$/i,
  /^[xyz]\d*$/i,
]

export function isAmbiguousName(name: string): boolean {
  return AMBIGUOUS_NAME_PATTERNS.some((p) => p.test(name.trim()))
}

// ============================================================
// Review reason
// ============================================================

function getReviewReason(block: QuestionBlock): string | null {
  const fp = block.columns[0]?.fingerprint
  if (!fp) return 'No data fingerprint available.'

  if (fp.nUnique <= 6 && fp.numericRatio > 0.8 && block.questionType === 'rating') {
    return 'These look like numbers with only ' + fp.nUnique + ' unique values. Are they a real scale or category codes?'
  }

  const pctMissing = fp.nMissing / fp.nRows
  if (pctMissing > 0.3 && block.questionType !== 'checkbox' && block.questionType !== 'multi_assigned') {
    return Math.round(pctMissing * 100) + '% of responses are empty. Was this question only shown to some respondents?'
  }

  if (isAmbiguousName(block.columns[0]?.name ?? '')) {
    return 'Column name is generic. Consider renaming for clearer analysis output.'
  }

  return null
}

// ============================================================
// Component
// ============================================================

export function BulkTaggerTable({ blocks, onUpdateBlock, onConfirmAll }: BulkTaggerTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [nameValue, setNameValue] = useState('')

  const blocksWithData = blocks.filter((b) => b.columns.length > 0)
  const reviewCount = blocksWithData.filter((b) => !b.confirmed).length
  const confirmedCount = blocksWithData.filter((b) => b.confirmed).length
  const allConfirmed = reviewCount === 0

  const handleTypeChange = useCallback((blockIdx: number, block: QuestionBlock, newType: QuestionType) => {
    const nullMeaning: NullMeaning = (newType === 'checkbox' || newType === 'multi_assigned') ? 'not_chosen' : (block.columns[0]?.nullMeaning ?? 'missing')
    onUpdateBlock(blockIdx, {
      ...block,
      questionType: newType,
      columns: block.columns.map((c) => ({ ...c, type: newType, nullMeaning })),
    })
  }, [onUpdateBlock])

  const handleConfirmRow = useCallback((blockIdx: number, block: QuestionBlock) => {
    onUpdateBlock(blockIdx, { ...block, confirmed: true })
    setExpandedRow(null)
  }, [onUpdateBlock])

  const handleRoutingChoice = useCallback((blockIdx: number, block: QuestionBlock, isConditional: boolean) => {
    if (isConditional) {
      onUpdateBlock(blockIdx, {
        ...block,
        confirmed: true,
        columns: block.columns.map((c) => ({ ...c, nullMeaning: 'not_asked' as NullMeaning })),
      })
    } else {
      onUpdateBlock(blockIdx, { ...block, confirmed: true })
    }
    setExpandedRow(null)
  }, [onUpdateBlock])

  const handleRename = useCallback((blockIdx: number, block: QuestionBlock) => {
    if (!nameValue.trim()) return
    const newName = nameValue.trim()
    onUpdateBlock(blockIdx, {
      ...block,
      label: newName,
      columns: block.columns.map((c) => ({ ...c, name: newName })),
    })
    setEditingName(null)
    setNameValue('')
  }, [nameValue, onUpdateBlock])

  const handleConfirmAllHighConfidence = useCallback(() => {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      if (block.columns.length === 0 || block.confirmed) continue
      if (getDetectionConfidence(block) === 'high' && !getReviewReason(block)) {
        onUpdateBlock(i, { ...block, confirmed: true })
      }
    }
    onConfirmAll()
  }, [blocks, onUpdateBlock, onConfirmAll])

  // Sample values for display
  const getSampleValues = useCallback((block: QuestionBlock): string => {
    const vals = block.columns[0]?.rawValues
      ?.filter((v) => v !== null)
      .slice(0, 4)
      .map((v) => String(v).length > 15 ? String(v).slice(0, 15) + '...' : String(v))
    return vals?.join(', ') ?? ''
  }, [])

  return (
    <div className="bulk-tagger">
      <div className="bulk-tagger-header">
        <div className="bulk-tagger-title">
          <h2>Your data has {blocksWithData.length} columns. Review the detected types and confirm.</h2>
        </div>
        <div className="bulk-tagger-actions">
          <button className="btn btn-primary" onClick={handleConfirmAllHighConfidence}>
            Confirm all that look right
          </button>
          {reviewCount > 0 && (
            <span className="badge badge-amber bulk-review-badge" onClick={() => {
              const firstUnconfirmed = blocksWithData.find((b) => !b.confirmed)
              if (firstUnconfirmed) setExpandedRow(firstUnconfirmed.id)
            }}>
              {reviewCount} need review
            </span>
          )}
          {reviewCount === 0 && confirmedCount > 0 && (
            <span className="badge badge-teal">{confirmedCount} confirmed</span>
          )}
        </div>
      </div>

      <div className="bulk-table-wrap">
        <table className="bulk-table">
          <thead>
            <tr>
              <th>Column name</th>
              <th>Sample values</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block, blockIdx) => {
              if (block.columns.length === 0) return null
              const confidence = getDetectionConfidence(block)
              const reviewReason = getReviewReason(block)
              const isConfirmed = block.confirmed
              const isExpanded = expandedRow === block.id
              const colName = block.columns[0]?.name ?? block.label
              const ambiguous = isAmbiguousName(colName)
              const isEditingThis = editingName === block.id

              return (
                <tr key={block.id} className={isConfirmed ? 'bulk-row-confirmed' : 'bulk-row-review'}>
                  <td className="bulk-col-name">
                    {isEditingThis ? (
                      <span className="bulk-rename">
                        <input
                          autoFocus
                          value={nameValue}
                          onChange={(e) => setNameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(blockIdx, block); if (e.key === 'Escape') setEditingName(null) }}
                          onBlur={() => handleRename(blockIdx, block)}
                        />
                      </span>
                    ) : (
                      <span>
                        {colName}
                        {ambiguous && (
                          <button className="bulk-rename-btn" onClick={() => { setEditingName(block.id); setNameValue(colName) }} title="Rename">
                            &#9998;
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="bulk-col-sample">{getSampleValues(block)}</td>
                  <td className="bulk-col-type">
                    <select
                      value={block.questionType}
                      onChange={(e) => handleTypeChange(blockIdx, block, e.target.value as QuestionType)}
                      className="bulk-type-select"
                    >
                      {SELECTABLE_TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_DESCRIPTIONS[t].label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="bulk-col-status">
                    {isConfirmed ? (
                      <span className="bulk-status-confirmed">Confirmed</span>
                    ) : (
                      <button className="bulk-status-review" onClick={() => setExpandedRow(isExpanded ? null : block.id)}>
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Expanded review row */}
      {expandedRow && (() => {
        const blockIdx = blocks.findIndex((b) => b.id === expandedRow)
        const block = blocks[blockIdx]
        if (!block || block.columns.length === 0) return null
        const reason = getReviewReason(block)
        const fp = block.columns[0]?.fingerprint
        const pctMissing = fp ? fp.nMissing / fp.nRows : 0

        return (
          <div className="bulk-expand-panel card">
            <div className="bulk-expand-header">
              <strong>{block.columns[0]?.name ?? block.label}</strong>
            </div>
            {reason && <p className="bulk-expand-reason">{reason}</p>}

            {/* Routing detection */}
            {pctMissing > 0.3 && block.questionType !== 'checkbox' && block.questionType !== 'multi_assigned' && (
              <div className="bulk-expand-actions">
                <button className="btn btn-secondary" onClick={() => handleRoutingChoice(blockIdx, block, true)}>
                  Yes — conditional question
                </button>
                <button className="btn btn-secondary" onClick={() => handleRoutingChoice(blockIdx, block, false)}>
                  No — all respondents saw it
                </button>
              </div>
            )}

            {/* Nominal-integer */}
            {fp && fp.nUnique <= 6 && fp.numericRatio > 0.8 && block.questionType === 'rating' && (
              <div className="bulk-expand-actions">
                <button className="btn btn-secondary" onClick={() => { handleTypeChange(blockIdx, block, 'category'); handleConfirmRow(blockIdx, { ...block, questionType: 'category' }) }}>
                  They're categories
                </button>
                <button className="btn btn-secondary" onClick={() => handleConfirmRow(blockIdx, block)}>
                  They're a real scale
                </button>
              </div>
            )}

            {/* Generic confirm */}
            {!(pctMissing > 0.3 && block.questionType !== 'checkbox') && !(fp && fp.nUnique <= 6 && fp.numericRatio > 0.8 && block.questionType === 'rating') && (
              <div className="bulk-expand-actions">
                <button className="btn btn-primary" onClick={() => handleConfirmRow(blockIdx, block)}>
                  Looks right
                </button>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
