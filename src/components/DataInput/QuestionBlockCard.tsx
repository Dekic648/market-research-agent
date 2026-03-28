/**
 * QuestionBlockCard — one paste box for one question.
 *
 * After data is pasted, shows an interpretation card with:
 * - Plain-language type name and consequence statement
 * - Confirm / Change action (user must explicitly confirm)
 * - Nominal-integer warning when applicable
 * - Help text on demand
 */

import { useState, useCallback, useRef } from 'react'
import type { QuestionBlock, QuestionType } from '../../types/dataTypes'
import { PasteGridAdapter } from '../../parsers/adapters/PasteGridAdapter'
import { computeFingerprint } from '../../parsers/fingerprint'
import { detectBehavioralSubtype, detectCategorySubtype } from '../../parsers/subtypeDetector'
import { TYPE_DESCRIPTIONS, SELECTABLE_TYPES } from './columnTypeDescriptions'
import './QuestionBlockCard.css'

interface QuestionBlockCardProps {
  block: QuestionBlock
  index: number
  onUpdate: (block: QuestionBlock) => void
  onRemove: () => void
}

export function QuestionBlockCard({ block, index, onUpdate, onRemove }: QuestionBlockCardProps) {
  const [rawText, setRawText] = useState('')
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasParsedData = block.columns.length > 0
  const typeDesc = TYPE_DESCRIPTIONS[block.questionType]

  // Nominal-integer risk: numeric column, nUnique <= 6, auto-type is 'rating'
  const showNominalWarning = hasParsedData
    && !block.confirmed
    && block.questionType === 'rating'
    && block.columns[0]?.fingerprint
    && block.columns[0].fingerprint.numericRatio > 0.8
    && block.columns[0].fingerprint.nUnique <= 6

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
        const columns = parsed.columns.map((col) => {
          const fp = computeFingerprint(col.values, `${block.id}_${col.id}`)
          const colDef = {
            id: `${block.id}_${col.id}`,
            name: col.name,
            type: block.questionType,
            nRows: col.values.length,
            nMissing: col.values.filter((v: unknown) => v === null).length,
            rawValues: col.values,
            fingerprint: fp,
            semanticDetectionCache: null,
            transformStack: [] as any[],
            sensitivity: 'anonymous' as const,
            declaredScaleRange: block.scaleRange ?? null,
            behavioralSubtype: block.questionType === 'behavioral'
              ? detectBehavioralSubtype(col.values, fp) : undefined,
            categorySubtype: (block.questionType === 'category' || block.questionType === 'radio')
              ? detectCategorySubtype(col.values, fp, col.name) : undefined,
            subtype: undefined as any,
          }
          colDef.subtype = colDef.behavioralSubtype ?? colDef.categorySubtype
          return colDef
        })

        let scaleRange = block.scaleRange
        if (!scaleRange && columns.length > 0) {
          const fp = columns[0].fingerprint
          if (fp && fp.numericRatio > 0.8 && fp.min !== null && fp.max !== null && fp.nUnique >= 3 && fp.nUnique <= 11) {
            scaleRange = [fp.min, fp.max]
          }
        }

        let label = block.label
        if (!label || /^Question \d+$/.test(label) || label === '') {
          if (columns.length === 1) {
            label = columns[0].name
          } else {
            const names = columns.map((c) => c.name)
            const prefix = commonPrefix(names)
            label = prefix.length >= 3 ? prefix.replace(/[\s:_-]+$/, '') : names[0]
          }
        }

        onUpdate({ ...block, columns, scaleRange, label, confirmed: false })
        setShowTypeSelector(false)
      } catch (err) {
        console.error('Parse error:', err)
      }
    },
    [block, onUpdate]
  )

  const handleConfirmType = useCallback(() => {
    onUpdate({ ...block, confirmed: true })
    setShowTypeSelector(false)
  }, [block, onUpdate])

  const handleChangeType = useCallback((newType: QuestionType) => {
    onUpdate({ ...block, questionType: newType, confirmed: true })
    setShowTypeSelector(false)
  }, [block, onUpdate])

  const handleNominalChoice = useCallback((isCategory: boolean) => {
    if (isCategory) {
      onUpdate({ ...block, questionType: 'category', confirmed: true })
    } else {
      onUpdate({ ...block, confirmed: true })
    }
    setShowTypeSelector(false)
  }, [block, onUpdate])

  const roleLabel = block.role === 'segment' ? 'SEGMENT' : block.role === 'weight' ? 'WEIGHT' : null
  const isOrdinal = block.questionType === 'rating' || block.questionType === 'matrix'

  return (
    <div className={`qb-card card ${block.role !== 'question' ? 'qb-card-special' : ''} ${hasParsedData && !block.confirmed ? 'qb-unconfirmed' : ''} ${block.confirmed ? 'qb-confirmed' : ''}`}>
      {/* Header */}
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
            <button className="qb-role-btn" onClick={() => onUpdate({ ...block, role: 'segment' })} title="Mark as segment variable">
              Set as Segment
            </button>
          )}
          {block.role === 'segment' && (
            <button className="qb-role-btn qb-role-active" onClick={() => onUpdate({ ...block, role: 'question' })}>
              Segment ✓
            </button>
          )}
          <button className="qb-remove" onClick={onRemove} title="Remove">×</button>
        </div>
      </div>

      {/* Paste area */}
      {!hasParsedData && (
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
      )}

      {/* Data preview + interpretation card */}
      {hasParsedData && (
        <>
          <div className="qb-preview">
            <div className="qb-preview-stats">
              <span className="badge badge-teal">{block.columns[0]?.nRows ?? 0} rows</span>
              <span className="badge badge-purple">{block.columns.length} col{block.columns.length !== 1 ? 's' : ''}</span>
              {block.columns[0]?.nMissing > 0 && (
                <span className="badge badge-amber">{block.columns[0].nMissing} missing</span>
              )}
            </div>
            <div className="qb-preview-grid">
              <table>
                <thead>
                  <tr>
                    {block.columns.slice(0, 6).map((col) => (
                      <th key={col.id} title={col.name}>{col.name}</th>
                    ))}
                    {block.columns.length > 6 && <th>+{block.columns.length - 6}</th>}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.min(3, block.columns[0]?.nRows ?? 0) }, (_, r) => (
                    <tr key={r}>
                      {block.columns.slice(0, 6).map((col) => (
                        <td key={col.id}>{col.rawValues[r] === null ? '' : String(col.rawValues[r])}</td>
                      ))}
                      {block.columns.length > 6 && <td>...</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Interpretation card */}
          <div className="qb-interpretation">
            <div className="qb-type-label">{typeDesc.label}</div>
            <div className="qb-type-consequence">{typeDesc.consequence}</div>

            {isOrdinal && (
              <div className="qb-scale-range-inline">
                Scale:
                <input type="number" className="qb-scale-input" placeholder="Min" value={block.scaleRange?.[0] ?? ''}
                  onChange={(e) => {
                    const min = e.target.value !== '' ? Number(e.target.value) : null
                    const max = block.scaleRange?.[1] ?? null
                    onUpdate({ ...block, scaleRange: [min ?? 1, max ?? 5] })
                  }} />
                <span className="qb-scale-dash">–</span>
                <input type="number" className="qb-scale-input" placeholder="Max" value={block.scaleRange?.[1] ?? ''}
                  onChange={(e) => {
                    const max = e.target.value !== '' ? Number(e.target.value) : null
                    const min = block.scaleRange?.[0] ?? null
                    onUpdate({ ...block, scaleRange: [min ?? 1, max ?? 5] })
                  }} />
              </div>
            )}

            {/* Nominal-integer warning */}
            {showNominalWarning && (
              <div className="qb-nominal-warning">
                <p>These look like numbers, but are they a real scale — or do they represent categories like 1=Male, 2=Female?</p>
                <div className="qb-nominal-actions">
                  <button className="btn btn-secondary" onClick={() => handleNominalChoice(true)}>
                    They're categories
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleNominalChoice(false)}>
                    They're a real scale
                  </button>
                </div>
              </div>
            )}

            {/* Confirm / Change */}
            {!block.confirmed && !showNominalWarning && (
              <div className="qb-confirm-actions">
                <button className="btn btn-primary" onClick={handleConfirmType}>Looks right</button>
                <button className="btn btn-secondary" onClick={() => setShowTypeSelector(!showTypeSelector)}>Change type</button>
              </div>
            )}

            {block.confirmed && (
              <div className="qb-confirmed-badge">
                <span className="badge badge-teal">Confirmed</span>
                <button className="qb-change-link" onClick={() => { onUpdate({ ...block, confirmed: false }); setShowTypeSelector(true) }}>
                  Change
                </button>
              </div>
            )}

            {/* Type selector */}
            {showTypeSelector && (
              <div className="qb-type-selector">
                {SELECTABLE_TYPES.map((t) => (
                  <button key={t} className={`qb-type-option ${t === block.questionType ? 'active' : ''}`} onClick={() => handleChangeType(t)}>
                    <span className="qb-type-option-label">{TYPE_DESCRIPTIONS[t].label}</span>
                    <span className="qb-type-option-consequence">{TYPE_DESCRIPTIONS[t].consequence}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Help text */}
            <button className="qb-help-toggle" onClick={() => setShowHelp(!showHelp)}>
              {showHelp ? 'Hide explanation' : 'What does this mean?'}
            </button>
            {showHelp && <div className="qb-help-text">{typeDesc.helpText}</div>}
          </div>

          <button className="qb-clear-btn" onClick={() => { setRawText(''); onUpdate({ ...block, columns: [], confirmed: false }); setShowTypeSelector(false) }}>
            Clear &amp; re-paste
          </button>
        </>
      )}
    </div>
  )
}

function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return ''
  let prefix = strings[0]
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
      if (prefix.length === 0) return ''
    }
  }
  return prefix
}
