/**
 * QuestionBlockEntry — multi-box container managing QuestionBlock[].
 *
 * For < 8 columns: individual QuestionBlockCard per column
 * For 8+ columns: BulkTaggerTable with compact table view
 */

import { useState, useCallback } from 'react'
import { QuestionBlockCard } from './QuestionBlockCard'
import { BulkTaggerTable, getDetectionConfidence } from './BulkTaggerTable'
import type { QuestionBlock, ColumnRole } from '../../types/dataTypes'
import './QuestionBlockEntry.css'

interface QuestionBlockEntryProps {
  onBlocksConfirmed: (blocks: QuestionBlock[]) => void
}

let blockIdCounter = 0
function createEmptyBlock(displayNumber?: number): QuestionBlock {
  const id = `qb_${++blockIdCounter}_${Date.now()}`
  return {
    id,
    label: displayNumber ? `Question ${displayNumber}` : '',
    format: 'rating',
    questionType: 'rating',
    columns: [],
    role: 'analyze' as ColumnRole,
    confirmed: false,
    pastedAt: Date.now(),
  }
}

export function QuestionBlockEntry({ onBlocksConfirmed }: QuestionBlockEntryProps) {
  const [blocks, setBlocks] = useState<QuestionBlock[]>([createEmptyBlock(1)])

  const addBlock = useCallback(() => {
    setBlocks((prev) => {
      const questionCount = prev.filter((b) => b.role === 'analyze').length
      return [...prev, createEmptyBlock(questionCount + 1)]
    })
  }, [])

  const addSegmentBlock = useCallback(() => {
    const segCount = blocks.filter((b) => b.role === 'segment').length
    const seg = createEmptyBlock()
    seg.role = 'segment'
    seg.label = segCount === 0 ? 'Segment' : `Segment ${segCount + 1}`
    seg.format = 'category'
    seg.questionType = 'category'
    setBlocks((prev) => [...prev, seg])
  }, [blocks])

  const addBehavioralBlock = useCallback(() => {
    const behCount = blocks.filter((b) => b.role === 'metric').length
    const beh = createEmptyBlock()
    beh.role = 'metric'
    beh.label = behCount === 0 ? 'Behavioral / CRM Data' : `Behavioral Data ${behCount + 1}`
    beh.format = 'behavioral'
    beh.questionType = 'behavioral'
    setBlocks((prev) => [...prev, beh])
  }, [blocks])

  const updateBlock = useCallback((index: number, updated: QuestionBlock) => {
    setBlocks((prev) => {
      const next = [...prev]
      next[index] = updated
      return next
    })
  }, [])

  const removeBlock = useCallback((index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const blocksWithData = blocks.filter((b) => b.columns.length > 0)
  const hasData = blocksWithData.length > 0
  const allConfirmed = blocksWithData.every((b) => b.confirmed)
  const unconfirmedCount = blocksWithData.filter((b) => !b.confirmed).length
  const hasSegment = blocks.some((b) => b.role === 'segment')
  const hasBehavioral = blocks.some((b) => b.role === 'metric')
  const questionCount = blocks.filter((b) => b.role === 'analyze' && b.columns.length > 0).length
  const behavioralCount = blocks.filter((b) => b.role === 'metric' && b.columns.length > 0).length

  // Bulk mode: 8+ columns with data
  const isBulkMode = blocksWithData.length >= 8

  // Auto-confirm high-confidence blocks (for bulk mode initial state)
  const handleBulkConfirmAll = useCallback(() => {
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.columns.length === 0 || block.confirmed) return block
        if (getDetectionConfidence(block) === 'high') {
          return { ...block, confirmed: true }
        }
        return block
      })
    )
  }, [])

  return (
    <div className="qb-entry">
      <div className="qb-entry-header">
        <h2>{isBulkMode ? 'Review Column Types' : 'Add Your Questions'}</h2>
        {!isBulkMode && (
          <p>Paste each question's data in its own box. Matrix grids and checkbox groups stay together as one question.</p>
        )}
      </div>

      {isBulkMode ? (
        <BulkTaggerTable
          blocks={blocks}
          onUpdateBlock={updateBlock}
          onConfirmAll={handleBulkConfirmAll}
        />
      ) : (
        <>
          <div className="qb-list">
            {blocks.map((block, i) => {
              const displayIndex = block.role === 'analyze'
                ? blocks.filter((b, j) => j <= i && b.role === 'analyze').length
                : block.role === 'metric'
                  ? blocks.filter((b, j) => j <= i && b.role === 'metric').length
                  : undefined
              return (
                <QuestionBlockCard
                  key={block.id}
                  block={block}
                  index={displayIndex ?? 0}
                  onUpdate={(updated) => updateBlock(i, updated)}
                  onRemove={() => removeBlock(i)}
                />
              )
            })}
          </div>

          <div className="qb-actions">
            <button className="btn btn-secondary" onClick={addBlock}>
              + Add Question
            </button>
            <button className="btn btn-secondary" onClick={addSegmentBlock}>
              + Add Segment
            </button>
            <button className="btn btn-secondary" onClick={addBehavioralBlock}>
              + Add Behavioral Data
            </button>
          </div>
        </>
      )}

      <div className="qb-footer card">
        <div className="qb-footer-stats">
          <span className="badge badge-purple">{questionCount} question{questionCount !== 1 ? 's' : ''} with data</span>
          {hasSegment && <span className="badge badge-teal">{blocks.filter(b => b.role === 'segment').length} segment(s)</span>}
          {hasBehavioral && <span className="badge badge-purple">{behavioralCount} behavioral</span>}
        </div>
        {unconfirmedCount > 0 && hasData && (
          <span className="badge badge-amber">{unconfirmedCount} unconfirmed</span>
        )}
        <button
          className="btn btn-primary"
          disabled={!hasData || !allConfirmed}
          onClick={() => onBlocksConfirmed(blocksWithData)}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
