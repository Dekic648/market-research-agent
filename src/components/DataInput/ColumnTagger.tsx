/**
 * ColumnTagger — column type selection + scale range + detection flag display.
 *
 * Appears after data is parsed. User confirms or changes:
 * - Question type per column
 * - Which column is the segment
 * - Scale range for ordinal columns
 * - Detection flags from DetectionLayer
 */

import { useState, useMemo } from 'react'
import type { PastedData, ParsedColumn } from '../../parsers/adapters/PasteGridAdapter'
import type { QuestionType } from '../../types/dataTypes'
import type { DetectionFlag } from '../../detection/types'
import './ColumnTagger.css'

interface ColumnTag {
  columnId: string
  type: QuestionType
  isSegment: boolean
  scaleMin: number | null
  scaleMax: number | null
}

interface ColumnTaggerProps {
  parsedData: PastedData
  detectionFlags: DetectionFlag[]
  onTagsConfirmed: (tags: ColumnTag[]) => void
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'rating', label: 'Rating / Likert' },
  { value: 'matrix', label: 'Matrix item' },
  { value: 'category', label: 'Category' },
  { value: 'radio', label: 'Single choice' },
  { value: 'checkbox', label: 'Multi-select' },
  { value: 'behavioral', label: 'Behavioral / Numeric' },
  { value: 'verbatim', label: 'Open-ended text' },
  { value: 'timestamped', label: 'Date / Time' },
  { value: 'multi_assigned', label: 'Multi-coded' },
  { value: 'weight', label: 'Weight column' },
]

function guessType(col: ParsedColumn): QuestionType {
  const fp = col.fingerprint
  if (!fp) return 'category'

  // Mostly text → verbatim
  if (fp.numericRatio < 0.3 && fp.nUnique > 10) return 'verbatim'

  // Two unique values → might be binary/checkbox
  if (fp.nUnique === 2) return 'checkbox'

  // Numeric with few unique values → rating
  if (fp.numericRatio > 0.8 && fp.nUnique >= 3 && fp.nUnique <= 10) return 'rating'

  // Numeric with many unique values → behavioral
  if (fp.numericRatio > 0.8 && fp.nUnique > 10) return 'behavioral'

  // Few categories → category
  if (fp.nUnique <= 20) return 'category'

  return 'category'
}

function guessScaleRange(col: ParsedColumn): [number | null, number | null] {
  const fp = col.fingerprint
  if (!fp || fp.min === null || fp.max === null) return [null, null]
  if (fp.numericRatio < 0.8) return [null, null]
  if (fp.nUnique < 3 || fp.nUnique > 11) return [null, null]
  return [fp.min, fp.max]
}

export function ColumnTagger({ parsedData, detectionFlags, onTagsConfirmed }: ColumnTaggerProps) {
  const initialTags = useMemo(
    () =>
      parsedData.columns.map((col) => {
        const [scaleMin, scaleMax] = guessScaleRange(col)
        return {
          columnId: col.id,
          type: guessType(col),
          isSegment: false,
          scaleMin,
          scaleMax,
        }
      }),
    [parsedData]
  )

  const [tags, setTags] = useState<ColumnTag[]>(initialTags)

  const updateTag = (colId: string, patch: Partial<ColumnTag>) => {
    setTags((prev) =>
      prev.map((t) => {
        if (t.columnId !== colId) {
          // If setting a new segment, unset others
          if (patch.isSegment) return { ...t, isSegment: false }
          return t
        }
        return { ...t, ...patch }
      })
    )
  }

  const flagsByColumn = useMemo(() => {
    const map = new Map<string, DetectionFlag[]>()
    for (const flag of detectionFlags) {
      const existing = map.get(flag.columnId) ?? []
      existing.push(flag)
      map.set(flag.columnId, existing)
    }
    return map
  }, [detectionFlags])

  const segmentColumn = tags.find((t) => t.isSegment)

  return (
    <div className="column-tagger card">
      <div className="tagger-header">
        <h2>Tag Columns</h2>
        <p>Confirm each column's type. Select one column as the segment variable.</p>
      </div>

      <div className="tagger-grid">
        {parsedData.columns.map((col, i) => {
          const tag = tags[i]
          const flags = flagsByColumn.get(col.id) ?? []
          const fp = col.fingerprint
          const isOrdinal = tag.type === 'rating' || tag.type === 'matrix'

          return (
            <div key={col.id} className={`tagger-row ${tag.isSegment ? 'is-segment' : ''}`}>
              <div className="tagger-col-info">
                <span className="col-name">{col.name}</span>
                <span className="col-stats">
                  {fp ? `${fp.nUnique} unique · ${fp.nMissing} missing · ${(fp.numericRatio * 100).toFixed(0)}% numeric` : ''}
                </span>
              </div>

              <div className="tagger-controls">
                <select
                  className="type-select"
                  value={tag.type}
                  onChange={(e) => updateTag(col.id, { type: e.target.value as QuestionType })}
                >
                  {QUESTION_TYPES.map((qt) => (
                    <option key={qt.value} value={qt.value}>{qt.label}</option>
                  ))}
                </select>

                {isOrdinal && (
                  <div className="scale-range">
                    <input
                      type="number"
                      className="scale-input"
                      placeholder="Min"
                      value={tag.scaleMin ?? ''}
                      onChange={(e) => updateTag(col.id, { scaleMin: e.target.value ? Number(e.target.value) : null })}
                    />
                    <span className="scale-dash">–</span>
                    <input
                      type="number"
                      className="scale-input"
                      placeholder="Max"
                      value={tag.scaleMax ?? ''}
                      onChange={(e) => updateTag(col.id, { scaleMax: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                )}

                <label className="segment-toggle">
                  <input
                    type="radio"
                    name="segment"
                    checked={tag.isSegment}
                    onChange={() => updateTag(col.id, { isSegment: true })}
                  />
                  Segment
                </label>
              </div>

              {flags.length > 0 && (
                <div className="tagger-flags">
                  {flags.map((flag) => (
                    <div
                      key={flag.id}
                      className={`flag-chip flag-${flag.severity}`}
                      title={flag.suggestion}
                    >
                      {flag.message.length > 80 ? flag.message.slice(0, 77) + '...' : flag.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="tagger-footer">
        <div className="tagger-summary">
          {segmentColumn
            ? <span className="badge badge-teal">Segment: {parsedData.columns.find((c) => c.id === segmentColumn.columnId)?.name}</span>
            : <span className="badge badge-amber">No segment selected</span>
          }
          <span className="badge badge-purple">{tags.filter((t) => t.type === 'rating' || t.type === 'matrix').length} scale items</span>
          {detectionFlags.length > 0 && (
            <span className="badge badge-red">{detectionFlags.length} flag(s)</span>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => onTagsConfirmed(tags)}
        >
          Confirm &amp; Continue
        </button>
      </div>
    </div>
  )
}

export type { ColumnTag }
