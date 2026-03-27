/**
 * PrepWorkspace — the preparation layer between tagging and analysis.
 *
 * Three panels + PrepLog strip:
 * 1. MissingDataPanel — MANDATORY
 * 2. RecodePanel — driven by detection flags
 * 3. PrepLog — shows status, "Run Analysis" button
 */

import { useState, useCallback } from 'react'
import { MissingDataPanel } from './MissingDataPanel'
import { RecodePanel } from './RecodePanel'
import type { ColumnDefinition, DatasetNode, Transform } from '../../types/dataTypes'
import type { DetectionFlag } from '../../detection/types'
import type { MissingDataStrategy } from '../../preparation/types'
import { useDatasetGraphStore } from '../../stores/datasetGraph'
import { useAnalysisLog } from '../../stores/analysisLog'
import './PrepPanels.css'

interface PrepWorkspaceProps {
  node: DatasetNode
  detectionFlags: DetectionFlag[]
  onReadyToAnalyze: () => void
}

export function PrepWorkspace({ node, detectionFlags, onReadyToAnalyze }: PrepWorkspaceProps) {
  const [strategy, setStrategy] = useState<MissingDataStrategy | null>(null)
  const addTransform = useDatasetGraphStore((s) => s.addTransform)
  const logAction = useAnalysisLog((s) => s.log)

  // Flatten all columns from groups
  const allColumns: ColumnDefinition[] = node.parsedData.groups.flatMap((g) => g.columns)

  const handleStrategyChange = useCallback(
    (s: MissingDataStrategy) => {
      setStrategy(s)
      logAction({
        type: 'missing_strategy_declared',
        userId: 'anonymous',
        dataFingerprint: allColumns[0]?.fingerprint?.hash ?? 'unknown',
        dataVersion: node.dataVersion,
        sessionId: 'current',
        payload: { strategy: s },
      })
    },
    [logAction, allColumns, node.dataVersion]
  )

  const handleConfirmRecode = useCallback(
    (columnId: string, transform: Transform) => {
      addTransform(node.id, columnId, transform)
      logAction({
        type: 'transform_added',
        userId: 'anonymous',
        dataFingerprint: allColumns[0]?.fingerprint?.hash ?? 'unknown',
        dataVersion: node.dataVersion,
        sessionId: 'current',
        payload: { columnId, transformType: transform.type },
      })
    },
    [addTransform, node.id, node.dataVersion, logAction, allColumns]
  )

  const handleDismissFlag = useCallback(
    (flagId: string) => {
      logAction({
        type: 'detection_flag_dismissed',
        userId: 'anonymous',
        dataFingerprint: allColumns[0]?.fingerprint?.hash ?? 'unknown',
        dataVersion: node.dataVersion,
        sessionId: 'current',
        payload: { flagId },
      })
    },
    [logAction, allColumns, node.dataVersion]
  )

  const activeTransforms = allColumns.reduce(
    (sum, col) => sum + col.transformStack.filter((t) => t.enabled).length,
    0
  )

  const reverseFlags = detectionFlags.filter((f) => f.type === 'reverse_coded')

  return (
    <div className="prep-workspace">
      <div className="prep-panels">
        <MissingDataPanel
          columns={allColumns}
          strategy={strategy}
          onStrategyChange={handleStrategyChange}
        />
        <RecodePanel
          flags={detectionFlags}
          onConfirmRecode={handleConfirmRecode}
          onDismissFlag={handleDismissFlag}
        />
      </div>

      {/* PrepLog strip */}
      <div className="prep-log card">
        <div className="prep-log-items">
          {strategy ? (
            <span className="badge badge-teal">Missing: {strategy}</span>
          ) : (
            <span className="badge badge-red">Missing strategy required</span>
          )}
          {reverseFlags.length > 0 && (
            <span className="badge badge-amber">{reverseFlags.length} recode flag(s)</span>
          )}
          {activeTransforms > 0 && (
            <span className="badge badge-purple">{activeTransforms} transform(s) active</span>
          )}
        </div>

        <button
          className="btn btn-primary"
          disabled={!strategy}
          onClick={onReadyToAnalyze}
        >
          Run Analysis →
        </button>
      </div>
    </div>
  )
}
