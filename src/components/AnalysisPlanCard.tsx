/**
 * AnalysisPlanCard — shows the five-tier analysis plan before execution.
 *
 * One row per tier with eligibility status, cross-type badges,
 * and Tier 5 expandable manual confirmation.
 */

import { useState, useEffect } from 'react'
import type { AnalysisPlan, AnalysisTask } from '../types/dataTypes'
import './AnalysisPlanCard.css'

interface AnalysisPlanCardProps {
  plan: AnalysisPlan
  onRun: (confirmedTier5Tasks: string[]) => void
  onOpenExplorer: () => void
}

export function AnalysisPlanCard({ plan, onRun, onOpenExplorer }: AnalysisPlanCardProps) {
  const [tier5Expanded, setTier5Expanded] = useState(false)
  const [tier5Checked, setTier5Checked] = useState<Set<string>>(new Set())
  const [canRun, setCanRun] = useState(false)

  // Auto-enable after 2 seconds or on any interaction
  useEffect(() => {
    const timer = setTimeout(() => setCanRun(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  const handleInteraction = () => { if (!canRun) setCanRun(true) }

  const handleToggleTier5 = (taskId: string) => {
    setTier5Checked((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
    handleInteraction()
  }

  const handleRun = () => {
    onRun(Array.from(tier5Checked))
  }

  const totalTasks = plan.tiers.reduce((s, t) => s + (t.eligible ? t.tasks.length : 0), 0)

  return (
    <div className="plan-card card" onClick={handleInteraction}>
      <div className="plan-header">
        <h2>Analysis Plan</h2>
        <span className="plan-task-count">{totalTasks} analyses ready</span>
      </div>

      <div className="plan-tiers">
        {plan.tiers.map((tier) => (
          <div key={tier.id} className={`plan-tier ${tier.eligible ? 'plan-tier-eligible' : 'plan-tier-disabled'}`}>
            <div className="plan-tier-row">
              <span className="plan-tier-icon">
                {tier.id === 5 ? '⚙' : tier.eligible ? '✓' : '—'}
              </span>
              <div className="plan-tier-info">
                <span className="plan-tier-label">{tier.label}</span>
                <span className="plan-tier-desc">
                  {tier.eligible ? tier.description : tier.reason}
                </span>
              </div>
              {tier.crossType && (
                <span className="plan-cross-badge">Survey × Behavioral</span>
              )}
              {tier.id === 5 && tier.eligible && (
                <button
                  className="plan-tier5-toggle"
                  onClick={(e) => { e.stopPropagation(); setTier5Expanded(!tier5Expanded) }}
                >
                  {tier5Expanded ? '▾' : '▸'}
                </button>
              )}
            </div>

            {/* Tier 5 expanded checkboxes */}
            {tier.id === 5 && tier5Expanded && (
              <div className="plan-tier5-list">
                {tier.tasks.map((task) => (
                  <label key={task.id} className="plan-tier5-item">
                    <input
                      type="checkbox"
                      checked={tier5Checked.has(task.id)}
                      onChange={() => handleToggleTier5(task.id)}
                    />
                    <span>{task.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {plan.detectedOutcome && (
        <div className="plan-outcome-note">
          Auto-detected outcome: <strong>{plan.detectedOutcome}</strong>
        </div>
      )}

      <div className="plan-actions">
        <button
          className="btn btn-primary plan-run-btn"
          disabled={!canRun}
          onClick={handleRun}
        >
          Run Analysis →
        </button>
        <div className="plan-explorer-link" onClick={onOpenExplorer}>
          Want something different? Use Explorer →
        </div>
      </div>
    </div>
  )
}
