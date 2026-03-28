/**
 * WeightCalculator — lets researcher compute rake weights from population proportions.
 * Only renders when no weight column exists and at least one category column is present.
 */

import { useState, useCallback, useMemo } from 'react'
import { computeRakeWeights } from '../../engine/rakeWeights'
import { resolveColumn } from '../../engine/resolveColumn'
import type { ColumnDefinition, DatasetNode } from '../../types/dataTypes'
import './PrepPanels.css'

interface WeightCalculatorProps {
  node: DatasetNode
  columns: ColumnDefinition[]
  onWeightsComputed: (weights: number[], label: string) => void
}

export function WeightCalculator({ node, columns, onWeightsComputed }: WeightCalculatorProps) {
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [selectedColId, setSelectedColId] = useState('')
  const [popProportions, setPopProportions] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ min: number; max: number } | null>(null)

  const categoryCols = useMemo(
    () => columns.filter((c) => c.type === 'category' || c.type === 'radio'),
    [columns]
  )

  // Don't render if weights exist or no category columns
  if (node.weights || categoryCols.length === 0 || dismissed) return null

  const selectedCol = categoryCols.find((c) => c.id === selectedColId) ?? categoryCols[0]
  const resolvedValues = selectedCol ? resolveColumn(selectedCol) : []

  // Compute sample proportions
  const sampleGroups = useMemo(() => {
    const counts = new Map<string, number>()
    let total = 0
    for (const v of resolvedValues) {
      if (v === null) continue
      const key = String(v)
      counts.set(key, (counts.get(key) ?? 0) + 1)
      total++
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count, pct: total > 0 ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
  }, [resolvedValues])

  const totalPop = useMemo(() => {
    return Object.values(popProportions).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  }, [popProportions])

  const isValid = totalPop >= 99.5 && totalPop <= 100.5 && sampleGroups.every((g) => popProportions[g.label])

  const handleCompute = useCallback(() => {
    if (!selectedCol || !isValid) return
    const popProps: Record<string, number> = {}
    for (const [key, val] of Object.entries(popProportions)) {
      popProps[key] = parseFloat(val) / 100
    }
    const weightResult = computeRakeWeights(resolvedValues as (string | null)[], popProps)
    if (weightResult.error) return

    setResult({ min: weightResult.min, max: weightResult.max })
    onWeightsComputed(weightResult.weights, `Weights — ${selectedCol.name}`)
  }, [selectedCol, isValid, popProportions, resolvedValues, onWeightsComputed])

  return (
    <div className="prep-panel weight-calc-panel">
      {!expanded ? (
        <div className="weight-calc-collapsed">
          <div>
            <strong>Is your sample representative?</strong>
            <p>Weight your results if certain groups are over-represented.</p>
          </div>
          <div className="weight-calc-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(true)}>
              Set up weighting
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setDismissed(true)}>
              My sample is representative
            </button>
          </div>
        </div>
      ) : (
        <div className="weight-calc-expanded">
          <h4>Choose which column defines your groups:</h4>
          <select
            value={selectedColId || categoryCols[0]?.id}
            onChange={(e) => { setSelectedColId(e.target.value); setPopProportions({}); setResult(null) }}
            className="filter-select"
          >
            {categoryCols.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div className="weight-calc-table">
            <div className="weight-calc-row weight-calc-header">
              <span>Group</span>
              <span>Your sample</span>
              <span>Real population</span>
            </div>
            {sampleGroups.map((g) => (
              <div key={g.label} className="weight-calc-row">
                <span className="weight-calc-label">{g.label}</span>
                <span className="weight-calc-sample">{g.pct.toFixed(0)}%</span>
                <span className="weight-calc-pop">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={popProportions[g.label] ?? ''}
                    onChange={(e) => setPopProportions((prev) => ({ ...prev, [g.label]: e.target.value }))}
                    placeholder="%"
                    className="weight-pop-input"
                  />
                  %
                </span>
              </div>
            ))}
            <div className="weight-calc-total">
              Total: {totalPop.toFixed(0)}%
              {isValid ? ' ✓' : totalPop > 0 ? ' (must equal 100%)' : ''}
            </div>
          </div>

          <div className="weight-calc-actions">
            <button className="btn btn-primary" onClick={handleCompute} disabled={!isValid}>
              Compute weights
            </button>
            <button className="btn btn-secondary" onClick={() => setDismissed(true)}>
              My sample is already representative
            </button>
          </div>

          {result && (
            <div className="weight-calc-result">
              Weights computed. Results will reflect {selectedCol?.name} population proportions.
              Range: {result.min.toFixed(2)}× to {result.max.toFixed(2)}×
            </div>
          )}
        </div>
      )}
    </div>
  )
}
