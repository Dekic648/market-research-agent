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
import type { QuestionBlock, QuestionType, QuestionFormat, StatisticalType, ColumnRole, NullMeaning, ColumnDefinition, SubgroupFilter } from '../../types/dataTypes'
import { PasteGridAdapter } from '../../parsers/adapters/PasteGridAdapter'
import { computeFingerprint } from '../../parsers/fingerprint'
import { detectBehavioralSubtype, detectCategorySubtype } from '../../parsers/subtypeDetector'
import { detectRoutingSource, type RoutingMatch } from '../../detection/routingDetector'
import { formatOperator } from '../../engine/subgroupFilter'
import { TYPE_DESCRIPTIONS, SELECTABLE_TYPES } from './columnTypeDescriptions'
import { inferColumnType, isAlchemerCheckboxGrid } from './inferColumnType'
import './QuestionBlockCard.css'

interface QuestionBlockCardProps {
  block: QuestionBlock
  index: number
  onUpdate: (block: QuestionBlock) => void
  onRemove: () => void
  /** All confirmed columns across all blocks — for routing detection */
  allConfirmedColumns?: ColumnDefinition[]
  /** Callback to apply detected routing as subgroup filter */
  onApplyRoutingSubgroup?: (filter: SubgroupFilter) => void
}

export function QuestionBlockCard({ block, index, onUpdate, onRemove, allConfirmedColumns, onApplyRoutingSubgroup }: QuestionBlockCardProps) {
  const [rawText, setRawText] = useState('')
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [routingMatch, setRoutingMatch] = useState<RoutingMatch | null>(null)
  const [routingDismissed, setRoutingDismissed] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasParsedData = block.columns.length > 0
  const typeDesc = TYPE_DESCRIPTIONS[block.format]

  // Nominal-integer risk: numeric column, nUnique <= 6, auto-type is 'rating'
  const showNominalWarning = hasParsedData
    && !block.confirmed
    && block.format === 'rating'
    && block.columns[0]?.fingerprint
    && block.columns[0].fingerprint.numericRatio > 0.8
    && block.columns[0].fingerprint.nUnique <= 6

  /** Derive StatisticalType from QuestionFormat */
  const deriveStatisticalType = (fmt: QuestionFormat): StatisticalType => {
    switch (fmt) {
      case 'rating': case 'matrix': return 'ordinal'
      case 'behavioral': return 'continuous'
      case 'category': case 'radio': return 'categorical'
      case 'checkbox': return 'binary'
      case 'multi_response': case 'multi_assigned': return 'multi_response'
      case 'verbatim': return 'text'
      case 'timestamped': return 'temporal'
      case 'weight': return 'continuous'
      default: return 'categorical'
    }
  }

  /** Derive ColumnRole from block role and per-column type */
  const deriveColumnRole = (blockRole: ColumnRole, perColType: QuestionFormat): ColumnRole => {
    if (blockRole === 'metric') {
      // Behavioral block: assign metric or dimension based on detected type
      return (perColType === 'behavioral' || perColType === 'rating') ? 'metric' : 'dimension'
    }
    return blockRole
  }

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

          // For behavioral and segment blocks with multiple columns, detect each column's type individually.
          // Behavioral blocks: each column gets a role (metric/dimension) based on detected type.
          // Segment blocks: continuous columns get a warning suggesting Behavioral block instead.
          const perColType = ((block.role === 'metric') || (block.role === 'segment' && parsed.columns.length > 1))
            ? inferColumnType(col.values, fp, col.name)
            : block.format

          const nullMeaning: NullMeaning = (perColType === 'checkbox' || perColType === 'multi_assigned' || perColType === 'multi_response')
            ? 'not_chosen' : 'missing'
          const colDef = {
            id: `${block.id}_${col.id}`,
            name: col.name,
            format: perColType,
            type: perColType,
            statisticalType: deriveStatisticalType(perColType),
            role: deriveColumnRole(block.role, perColType),
            nRows: col.values.length,
            nMissing: col.values.filter((v: unknown) => v === null).length,
            nullMeaning,
            rawValues: col.values,
            fingerprint: fp,
            semanticDetectionCache: null,
            transformStack: [] as any[],
            sensitivity: 'anonymous' as const,
            declaredScaleRange: block.scaleRange ?? null,
            behavioralSubtype: perColType === 'behavioral'
              ? detectBehavioralSubtype(col.values, fp) : undefined,
            categorySubtype: (perColType === 'category' || perColType === 'radio')
              ? detectCategorySubtype(col.values, fp, col.name) : undefined,
            subtype: undefined as any,
            behavioralRole: block.role === 'metric'
              ? ((perColType === 'behavioral' || perColType === 'rating') ? 'metric' as const : 'dimension' as const)
              : undefined,
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

        // Alchemer checkbox grid detection: 3+ columns matching the pattern
        let detectedQuestionType = block.format
        if (block.role === 'analyze' && columns.length >= 3) {
          const gridCandidates = columns.map((c) => ({
            name: c.name,
            values: c.rawValues,
            fingerprint: c.fingerprint!,
          })).filter((c) => c.fingerprint)

          if (isAlchemerCheckboxGrid(gridCandidates)) {
            detectedQuestionType = 'multi_response'
            // Set nullMeaning and type on all columns
            for (const col of columns) {
              ;(col as any).format = 'multi_response'
              ;(col as any).type = 'multi_response'
              ;(col as any).statisticalType = 'multi_response'
              ;(col as any).nullMeaning = 'not_chosen'
            }
          }
        }

        // Matrix grid auto-detection: 3+ columns, all numeric with same range, similar headers
        // Only if not already detected as Alchemer checkbox
        if (detectedQuestionType !== 'multi_response' && block.role === 'analyze' && columns.length >= 3 && (block.format === 'rating' || detectedQuestionType === 'rating')) {
          const fps = columns.map((c) => c.fingerprint).filter(Boolean)
          if (fps.length >= 3) {
            const allNumeric = fps.every((fp) => fp!.numericRatio > 0.8)
            const mins = fps.map((fp) => fp!.min)
            const maxs = fps.map((fp) => fp!.max)
            const sameRange = mins.every((m) => m === mins[0]) && maxs.every((m) => m === maxs[0])
            if (allNumeric && sameRange) {
              detectedQuestionType = 'matrix'
            }
          }
        }

        onUpdate({ ...block, format: detectedQuestionType, questionType: detectedQuestionType, columns, scaleRange, label, confirmed: false })
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
    onUpdate({ ...block, format: newType, questionType: newType, confirmed: true })
    setShowTypeSelector(false)
  }, [block, onUpdate])

  const handleNominalChoice = useCallback((isCategory: boolean) => {
    if (isCategory) {
      onUpdate({ ...block, format: 'category', questionType: 'category', confirmed: true })
    } else {
      onUpdate({ ...block, confirmed: true })
    }
    setShowTypeSelector(false)
  }, [block, onUpdate])

  // Routing detection: high null rate on non-checkbox columns
  const nullRate = hasParsedData && block.columns[0]
    ? block.columns[0].nMissing / block.columns[0].nRows : 0
  const showRoutingPrompt = hasParsedData
    && !block.confirmed
    && nullRate > 0.3
    && block.format !== 'checkbox'
    && block.format !== 'multi_assigned'
    && block.columns[0]?.nullMeaning === 'missing'

  const handleRoutingChoice = useCallback((isConditional: boolean) => {
    if (isConditional) {
      const updated = {
        ...block,
        columns: block.columns.map((c) => ({ ...c, nullMeaning: 'not_asked' as NullMeaning })),
      }
      onUpdate(updated)

      // Run routing source detection
      if (allConfirmedColumns && block.columns[0]) {
        const match = detectRoutingSource(
          block.columns[0],
          allConfirmedColumns,
          block.columns[0].nRows
        )
        setRoutingMatch(match)
        setRoutingDismissed(false)
      }
    }
    // If not conditional, nullMeaning stays 'missing' — just dismiss
  }, [block, onUpdate, allConfirmedColumns])

  const handleApplyRouting = useCallback(() => {
    if (!routingMatch || !onApplyRoutingSubgroup) return
    const filter: SubgroupFilter = {
      id: `routing_${Date.now()}`,
      label: routingMatch.suggestedLabel,
      columnId: routingMatch.sourceColumnId,
      operator: routingMatch.operator,
      value: routingMatch.threshold,
      effectiveN: routingMatch.effectiveN,
      source: 'auto',
    }
    onApplyRoutingSubgroup(filter)
    setRoutingMatch(null)
  }, [routingMatch, onApplyRoutingSubgroup])

  const handleIgnoreRouting = useCallback(() => {
    setRoutingDismissed(true)
  }, [])

  const nullSemanticNote = block.columns[0]?.nullMeaning === 'not_chosen'
    ? 'Empty cells = not selected (counted in totals)'
    : block.columns[0]?.nullMeaning === 'not_asked'
      ? 'Empty cells = question not shown to this respondent'
      : 'Empty cells = no response recorded'

  const roleLabel = block.role === 'segment' ? 'SEGMENT'
    : block.role === 'weight' ? 'WEIGHT'
    : block.role === 'metric' ? 'DATA'
    : null
  const isOrdinal = block.format === 'rating' || block.format === 'matrix'

  // Behavioral block: default behavioralRole from inferColumnType result
  const defaultBehavioralRole = (col: ColumnDefinition): 'metric' | 'dimension' => {
    if (col.behavioralRole) return col.behavioralRole
    return (col.format === 'behavioral' || col.format === 'rating') ? 'metric' : 'dimension'
  }

  const handleToggleRole = useCallback((colId: string) => {
    const updated = {
      ...block,
      columns: block.columns.map((c) => {
        if (c.id !== colId) return c
        const current = defaultBehavioralRole(c)
        return { ...c, behavioralRole: current === 'metric' ? 'dimension' as const : 'metric' as const }
      }),
    }
    onUpdate(updated)
  }, [block, onUpdate])

  // Segment block: detect continuous columns that should be in a Behavioral block
  const segmentContinuousWarnings = (block.role === 'segment' && hasParsedData)
    ? block.columns.filter((c) => c.format === 'behavioral')
    : []

  return (
    <div className={`qb-card card ${block.role !== 'analyze' ? 'qb-card-special' : ''} ${hasParsedData && !block.confirmed ? 'qb-unconfirmed' : ''} ${block.confirmed ? 'qb-confirmed' : ''}`}>
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
          {block.role === 'analyze' && (
            <button className="qb-role-btn" onClick={() => onUpdate({ ...block, role: 'segment' })} title="Mark as segment variable">
              Set as Segment
            </button>
          )}
          {block.role === 'segment' && (
            <button className="qb-role-btn qb-role-active" onClick={() => onUpdate({ ...block, role: 'analyze' as const })}>
              Segment ✓
            </button>
          )}
          {block.role === 'metric' && (
            <span className="qb-role-btn qb-role-active" style={{ cursor: 'default' }}>
              Behavioral
            </span>
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
              {block.columns[0]?.nMissing > 0 && !block.columns[0]?.imputedValues && (() => {
                const col = block.columns[0]
                const autoMedian = col.nullMeaning === 'missing'
                  && !col.imputedValues
                  && (col.format === 'behavioral' || col.format === 'rating' || col.format === 'matrix')
                  && col.nMissing / col.nRows <= 0.05
                return autoMedian
                  ? <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-faint)', fontSize: '10px' }}>{col.nMissing} values will be estimated — median</span>
                  : <span className="badge badge-amber">{col.nMissing} missing</span>
              })()}
              {block.columns[0]?.imputedValues && (
                <span className="badge badge-purple">MICE imputed — {block.columns[0].nMissing} values estimated</span>
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

          {/* Behavioral block: per-column role assignment table */}
          {block.role === 'metric' && hasParsedData && (
            <div className="qb-behavioral-roles">
              <div className="qb-behavioral-header">
                <strong>Assign column roles</strong>
                <span className="qb-behavioral-subtitle">Metrics are analyzed. Dimensions are used as split variables.</span>
              </div>
              <table className="qb-role-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Detected</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {block.columns.map((col) => {
                    const role = defaultBehavioralRole(col)
                    const typeChip = col.format === 'behavioral' ? 'continuous'
                      : col.format === 'rating' ? 'ordinal'
                      : col.format === 'category' ? 'categorical'
                      : col.format
                    return (
                      <tr key={col.id} className="qb-role-row">
                        <td className="qb-role-col-name">{col.name}</td>
                        <td><span className={`qb-type-chip qb-type-chip-${col.format}`}>{typeChip}</span></td>
                        <td>
                          <button
                            className={`qb-role-toggle ${role === 'metric' ? 'qb-role-metric' : 'qb-role-dimension'}`}
                            onClick={() => handleToggleRole(col.id)}
                          >
                            {role === 'metric' ? 'Metric' : 'Dimension'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Segment block: warning for continuous columns */}
          {segmentContinuousWarnings.length > 0 && (
            <div className="qb-segment-continuous-warning">
              <strong>Some columns look like metrics, not segments:</strong>
              <ul>
                {segmentContinuousWarnings.map((col) => (
                  <li key={col.id}>{col.name}</li>
                ))}
              </ul>
              <p>Move these to a Behavioral Dataset block to include them in analysis.</p>
            </div>
          )}

          {/* Interpretation card */}
          <div className="qb-interpretation">
            <div className="qb-type-label">{typeDesc?.label ?? block.format}</div>
            <div className="qb-type-consequence">{typeDesc?.consequence ?? ''}</div>

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

            {/* Alchemer checkbox grid suggestion */}
            {hasParsedData && !block.confirmed && block.format === 'multi_response' && block.columns.length >= 3 && (
              <div className="qb-matrix-suggestion">
                <p>Looks like a checkbox grid (Alchemer format) — each column is one option, blank means not selected. Treat as a multi-select question?</p>
                <div className="qb-nominal-actions">
                  <button className="btn btn-primary" onClick={handleConfirmType}>
                    Yes, treat as checkbox grid
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleChangeType('rating')}>
                    No, tag individually
                  </button>
                </div>
              </div>
            )}

            {/* Matrix grid suggestion */}
            {hasParsedData && !block.confirmed && block.format === 'matrix' && block.columns.length >= 3 && (
              <div className="qb-matrix-suggestion">
                <p>These look like a matrix grid question — same scale across {block.columns.length} items. Treat as a group for reliability and factor analysis?</p>
                <div className="qb-nominal-actions">
                  <button className="btn btn-primary" onClick={handleConfirmType}>
                    Yes, treat as matrix
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleChangeType('rating')}>
                    No, tag individually
                  </button>
                </div>
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

            {/* Routing detection prompt */}
            {showRoutingPrompt && (
              <div className="qb-routing-prompt">
                <p><strong>{(nullRate * 100).toFixed(0)}% of responses are empty for this column.</strong> Were some respondents skipped based on a previous answer?</p>
                <div className="qb-nominal-actions">
                  <button className="btn btn-secondary" onClick={() => handleRoutingChoice(true)}>
                    Yes — conditional question
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleRoutingChoice(false)}>
                    No — all respondents saw it
                  </button>
                </div>
              </div>
            )}

            {/* Routing source match card */}
            {routingMatch && !routingDismissed && block.columns[0]?.nullMeaning === 'not_asked' && (
              <div className="qb-routing-match">
                <div className="qb-routing-match-title">Routing source detected</div>
                <p>
                  This question appears to have been shown only to respondents who rated
                  &quot;{routingMatch.sourceColumnName}&quot; at {formatOperator(routingMatch.operator, routingMatch.threshold)}.
                </p>
                <div className="qb-routing-match-stats">
                  <span>Match confidence: {(routingMatch.overlapPct * 100).toFixed(0)}% of null patterns align</span>
                  <span>Respondents who saw this question: {routingMatch.effectiveN} of {block.columns[0]?.nRows ?? 0}</span>
                </div>
                <div className="qb-nominal-actions">
                  <button className="btn btn-primary" onClick={handleApplyRouting}>
                    Apply as analysis base
                  </button>
                  <button className="btn btn-secondary" onClick={handleIgnoreRouting}>
                    Ignore
                  </button>
                </div>
              </div>
            )}

            {/* Null semantics note */}
            {hasParsedData && block.columns[0]?.nMissing > 0 && (
              <div className="qb-null-note">{nullSemanticNote}</div>
            )}

            {/* Confirm / Change — always visible when unconfirmed */}
            {!block.confirmed && (
              <div className="qb-confirm-actions">
                {!showNominalWarning && (
                  <button className="btn btn-primary" onClick={handleConfirmType}>Looks right</button>
                )}
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
                  <button key={t} className={`qb-type-option ${t === block.format ? 'active' : ''}`} onClick={() => handleChangeType(t)}>
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
