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
    label: '',
    questionType: 'rating',
    columns: [],
    role: 'question',
    pastedAt: Date.now(),
  }
}

export function QuestionBlockEntry({ onBlocksConfirmed }: QuestionBlockEntryProps) {
  const [blocks, setBlocks] = useState<QuestionBlock[]>([createEmptyBlock()])

  const addBlock = useCallback(() => {
    setBlocks((prev) => [...prev, createEmptyBlock()])
  }, [])

  const addSegmentBlock = useCallback(() => {
    const hasSegment = blocks.some((b) => b.role === 'segment')
    if (hasSegment) return

    const seg = createEmptyBlock()
    seg.role = 'segment'
    seg.label = 'Segment'
    seg.questionType = 'category'
    setBlocks((prev) => [...prev, seg])
  }, [blocks])

  const updateBlock = useCallback((index: number, updated: QuestionBlock) => {
    setBlocks((prev) => {
      const next = [...prev]
      // If setting this block as segment, unset any other segment
      if (updated.role === 'segment') {
        for (let i = 0; i < next.length; i++) {
          if (i !== index && next[i].role === 'segment') {
            next[i] = { ...next[i], role: 'question' }
          }
        }
      }
      next[index] = updated
      return next
    })
  }, [])

  const removeBlock = useCallback((index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const hasData = blocks.some((b) => b.columns.length > 0)
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
        {!hasSegment && (
          <button className="btn btn-secondary" onClick={addSegmentBlock}>
            + Add Segment
          </button>
        )}
      </div>

      <div className="qb-footer card">
        <div className="qb-footer-stats">
          <span className="badge badge-purple">{questionCount} question{questionCount !== 1 ? 's' : ''} with data</span>
          {hasSegment && <span className="badge badge-teal">Segment added</span>}
        </div>
        <button
          className="btn btn-primary"
          disabled={!hasData}
          onClick={() => onBlocksConfirmed(blocks.filter((b) => b.columns.length > 0))}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
