/**
 * QuestionBlockEntry — multi-box container managing QuestionBlock[].
 *
 * Each question gets its own paste box. User adds boxes as needed.
 * "Confirm All →" converts blocks to the analysis pipeline.
 */

import { useState, useCallback } from 'react'
import { QuestionBlockCard } from './QuestionBlockCard'
import type { QuestionBlock } from '../../types/dataTypes'
import './QuestionBlockEntry.css'

interface QuestionBlockEntryProps {
  onBlocksConfirmed: (blocks: QuestionBlock[]) => void
}

let blockCounter = 0
function createEmptyBlock(): QuestionBlock {
  const id = `qb_${++blockCounter}_${Date.now()}`
  return {
    id,
    label: `Question ${blockCounter}`,
    questionType: 'rating',
    columns: [],
    role: 'question',
    confirmed: false,
    pastedAt: Date.now(),
  }
}

export function QuestionBlockEntry({ onBlocksConfirmed }: QuestionBlockEntryProps) {
  const [blocks, setBlocks] = useState<QuestionBlock[]>([createEmptyBlock()])

  const addBlock = useCallback(() => {
    setBlocks((prev) => [...prev, createEmptyBlock()])
  }, [])

  const addSegmentBlock = useCallback(() => {
    const segCount = blocks.filter((b) => b.role === 'segment').length
    const seg = createEmptyBlock()
    seg.role = 'segment'
    seg.label = segCount === 0 ? 'Segment' : `Segment ${segCount + 1}`
    seg.questionType = 'category'
    setBlocks((prev) => [...prev, seg])
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
  const questionCount = blocks.filter((b) => b.role === 'question' && b.columns.length > 0).length

  return (
    <div className="qb-entry">
      <div className="qb-entry-header">
        <h2>Add Your Questions</h2>
        <p>Paste each question's data in its own box. Matrix grids and checkbox groups stay together as one question.</p>
      </div>

      <div className="qb-list">
        {blocks.map((block, i) => {
          const displayIndex = block.role === 'question'
            ? blocks.filter((b, j) => j <= i && b.role === 'question').length
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
      </div>

      <div className="qb-footer card">
        <div className="qb-footer-stats">
          <span className="badge badge-purple">{questionCount} question{questionCount !== 1 ? 's' : ''} with data</span>
          {hasSegment && <span className="badge badge-teal">{blocks.filter(b => b.role === 'segment').length} segment(s)</span>}
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
