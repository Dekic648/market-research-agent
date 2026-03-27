/**
 * TaskReview — the most important UX moment in the app.
 *
 * This is a JUDGMENT SURFACE, not a checklist.
 * Each proposed task is a card showing:
 *   - What analysis (label)
 *   - Why the system proposed it (reason, in plain language)
 *   - Which columns feed into it (data provenance)
 *   - Confirm / Skip toggle (visual weight to the decision)
 *
 * The researcher evaluates each proposal and decides whether it's
 * worth running. The system's intelligence becomes visible here.
 */

import { useState, useMemo } from 'react'
import type { AnalysisTask, QuestionBlock } from '../../types/dataTypes'
import './TaskReview.css'

interface TaskReviewProps {
  tasks: AnalysisTask[]
  blocks: QuestionBlock[]
  onConfirmed: (tasks: AnalysisTask[]) => void
}

export function TaskReview({ tasks: initialTasks, blocks, onConfirmed }: TaskReviewProps) {
  const [tasks, setTasks] = useState<AnalysisTask[]>(initialTasks)

  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: t.status === 'proposed' ? 'skipped' : 'proposed' }
          : t
      )
    )
  }

  // Group tasks by source question for display
  const grouped = useMemo(() => {
    const groups: Array<{
      key: string
      title: string
      subtitle: string
      tasks: AnalysisTask[]
      isCrossQuestion: boolean
    }> = []

    // Single-question tasks grouped by their source question
    const singleSourceTasks = tasks.filter((t) => t.sourceQuestionIds.length === 1)
    const byQuestion = new Map<string, AnalysisTask[]>()
    for (const task of singleSourceTasks) {
      const qId = task.sourceQuestionIds[0]
      if (!byQuestion.has(qId)) byQuestion.set(qId, [])
      byQuestion.get(qId)!.push(task)
    }

    for (const [qId, qTasks] of byQuestion) {
      const block = blocks.find((b) => b.id === qId)
      groups.push({
        key: qId,
        title: block?.label || qId,
        subtitle: `${block?.questionType ?? 'unknown'} · ${block?.columns.length ?? 0} item${(block?.columns.length ?? 0) !== 1 ? 's' : ''}`,
        tasks: qTasks,
        isCrossQuestion: false,
      })
    }

    // Cross-question tasks
    const crossTasks = tasks.filter((t) => t.sourceQuestionIds.length > 1)
    if (crossTasks.length > 0) {
      groups.push({
        key: '_cross',
        title: 'Cross-Question Analysis',
        subtitle: 'Analyses that combine data from multiple questions',
        tasks: crossTasks,
        isCrossQuestion: true,
      })
    }

    return groups
  }, [tasks, blocks])

  const confirmedCount = tasks.filter((t) => t.status === 'proposed').length
  const skippedCount = tasks.filter((t) => t.status === 'skipped').length

  const confirmAll = () => {
    setTasks((prev) => prev.map((t) => ({ ...t, status: 'proposed' as const })))
  }

  const skipAll = () => {
    setTasks((prev) => prev.map((t) => ({ ...t, status: 'skipped' as const })))
  }

  return (
    <div className="task-review">
      <div className="task-review-header">
        <div>
          <h2>Review Analysis Plan</h2>
          <p>
            The system proposed {tasks.length} analyses based on your data structure.
            Review each one — confirm what's valuable, skip what's not.
          </p>
        </div>
        <div className="task-review-bulk">
          <button className="btn btn-secondary" onClick={confirmAll}>Include All</button>
          <button className="btn btn-secondary" onClick={skipAll}>Skip All</button>
        </div>
      </div>

      <div className="task-groups">
        {grouped.map((group) => (
          <div key={group.key} className={`task-group ${group.isCrossQuestion ? 'task-group-cross' : ''}`}>
            <div className="task-group-header">
              <div className="task-group-title">
                {group.isCrossQuestion && <span className="cross-icon">⬡</span>}
                <h3>{group.title}</h3>
              </div>
              <span className="task-group-subtitle">{group.subtitle}</span>
            </div>

            <div className="task-cards">
              {group.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  blocks={blocks}
                  onToggle={() => toggleTask(task.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="task-review-footer card">
        <div className="task-review-counts">
          <span className="badge badge-teal">{confirmedCount} included</span>
          {skippedCount > 0 && <span className="badge badge-amber">{skippedCount} skipped</span>}
        </div>
        <button
          className="btn btn-primary"
          disabled={confirmedCount === 0}
          onClick={() => onConfirmed(tasks)}
        >
          Run {confirmedCount} Analysis{confirmedCount !== 1 ? 'es' : ''} →
        </button>
      </div>
    </div>
  )
}

// ============================================================
// TaskCard — the individual judgment unit
// ============================================================

function TaskCard({
  task,
  blocks,
  onToggle,
}: {
  task: AnalysisTask
  blocks: QuestionBlock[]
  onToggle: () => void
}) {
  const isIncluded = task.status === 'proposed'
  const hasDependency = task.dependsOn.length > 0

  // Resolve column names for display
  const columnNames = useMemo(() => {
    const names: string[] = []
    for (const colRef of task.inputs.columns) {
      const block = blocks.find((b) => b.id === colRef.questionBlockId)
      if (block) {
        const col = block.columns.find((c) => c.id === colRef.columnId)
        names.push(col?.name ?? colRef.columnId)
      }
    }
    return names
  }, [task.inputs.columns, blocks])

  const outcomeLabel = useMemo(() => {
    if (!task.inputs.outcome) return null
    const block = blocks.find((b) => b.id === task.inputs.outcome!.questionBlockId)
    if (!block) return null
    const col = block.columns.find((c) => c.id === task.inputs.outcome!.columnId)
    return col?.name ?? block.label
  }, [task.inputs.outcome, blocks])

  const segmentLabel = useMemo(() => {
    if (!task.inputs.segment) return null
    const block = blocks.find((b) => b.id === task.inputs.segment!.questionBlockId)
    return block?.label ?? 'Segment'
  }, [task.inputs.segment, blocks])

  return (
    <div
      className={`task-card ${isIncluded ? 'task-included' : 'task-skipped'}`}
      onClick={onToggle}
    >
      <div className="task-card-toggle">
        <div className={`task-toggle-dot ${isIncluded ? 'on' : 'off'}`}>
          {isIncluded ? '✓' : '–'}
        </div>
      </div>

      <div className="task-card-body">
        <div className="task-card-top">
          <span className="task-label">{task.label}</span>
          {hasDependency && (
            <span className="task-dep-badge" title={`Depends on: ${task.dependsOn.join(', ')}`}>
              chain
            </span>
          )}
        </div>

        <p className="task-reason">{task.reason}</p>

        <div className="task-data-involved">
          {outcomeLabel && (
            <div className="task-data-row">
              <span className="task-data-label">Outcome</span>
              <span className="task-data-value">{outcomeLabel}</span>
            </div>
          )}

          {columnNames.length > 0 && (
            <div className="task-data-row">
              <span className="task-data-label">
                {outcomeLabel ? 'Predictors' : 'Columns'}
              </span>
              <span className="task-data-value">
                {columnNames.length <= 4
                  ? columnNames.join(', ')
                  : `${columnNames.slice(0, 3).join(', ')} +${columnNames.length - 3} more`}
              </span>
            </div>
          )}

          {segmentLabel && (
            <div className="task-data-row">
              <span className="task-data-label">Split by</span>
              <span className="task-data-value">{segmentLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
