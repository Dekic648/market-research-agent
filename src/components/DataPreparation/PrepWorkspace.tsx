/**
 * PrepWorkspace — the preparation layer between tagging and analysis.
 *
 * Panels:
 * 1. MissingDataPanel — displays how null values will be handled based on column classifications
 * 2. RecodePanel — driven by detection flags
 * 3. PrepLog — shows status, "Run Analysis" button
 */

import { useCallback } from 'react'
import { MissingDataPanel } from './MissingDataPanel'
import { RecodePanel } from './RecodePanel'
import { WeightCalculator } from './WeightCalculator'
import { DataSummaryCard } from './DataSummaryCard'
import type { ColumnDefinition, DatasetNode, Transform } from '../../types/dataTypes'
import type { DetectionFlag } from '../../detection/types'
import { useDatasetGraphStore } from '../../stores/datasetGraph'
import { useAnalysisLog } from '../../stores/analysisLog'
import './PrepPanels.css'

interface PrepWorkspaceProps {
  node: DatasetNode
  detectionFlags: DetectionFlag[]
  onReadyToAnalyze: () => void
}

export function PrepWorkspace({ node, detectionFlags, onReadyToAnalyze }: PrepWorkspaceProps) {
  const addTransform = useDatasetGraphStore((s) => s.addTransform)
  const applyImputation = useDatasetGraphStore((s) => s.applyImputation)
  const setComputedWeights = useDatasetGraphStore((s) => s.setComputedWeights)
  const logAction = useAnalysisLog((s) => s.log)

  // Flatten all columns from groups
  const allColumns: ColumnDefinition[] = node.parsedData.groups.flatMap((g) => g.columns)

  const pendingFlagCount = detectionFlags.filter(
    (f) => f.type === 'reverse_coded' || f.type === 'merged_header' || f.type === 'possible_computed'
  ).length

  const handleImputationComplete = useCallback(
    (result: import('../../preparation/missingData').MICEResult) => {
      applyImputation(node.id, result.imputedColumns)
      logAction({
        type: 'imputation_applied',
        userId: 'anonymous',
        dataFingerprint: allColumns[0]?.fingerprint?.hash ?? 'unknown',
        dataVersion: node.dataVersion,
        sessionId: 'current',
        payload: {
          method: 'mice',
          nImputations: result.nImputations,
          columnsImputed: result.columnsImputed,
          totalImputed: result.totalImputed,
          columnIds: [...result.imputedColumns.keys()],
        },
      })
    },
    [applyImputation, node.id, node.dataVersion, logAction, allColumns]
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
  const readyToAnalyze = pendingFlagCount === 0

  // Build pseudo-blocks from node groups for DataSummaryCard
  const pseudoBlocks: import('../../types/dataTypes').QuestionBlock[] = node.parsedData.groups.map((g, i) => ({
    id: `group_${i}`,
    label: g.label,
    questionType: g.questionType,
    columns: g.columns,
    role: 'question' as const,
    confirmed: true,
    pastedAt: 0,
    scaleRange: g.scaleRange,
  }))

  return (
    <div className="prep-workspace">
      <DataSummaryCard
        blocks={pseudoBlocks}
        rowCount={node.rowCount}
        availableAnalysisCount={0}
      />
      <div className="prep-panels">
        <MissingDataPanel columns={allColumns} onImputationComplete={handleImputationComplete} />
        <RecodePanel
          flags={detectionFlags}
          onConfirmRecode={handleConfirmRecode}
          onDismissFlag={handleDismissFlag}
        />
      </div>

      <WeightCalculator
        node={node}
        columns={allColumns}
        onWeightsComputed={(weights, label) => setComputedWeights(node.id, weights, label)}
      />

      {/* PrepLog strip */}
      <div className="prep-log card">
        <div className="prep-log-items">
          {reverseFlags.length > 0 && (
            <span className="badge badge-amber">{reverseFlags.length} recode flag(s)</span>
          )}
          {activeTransforms > 0 && (
            <span className="badge badge-purple">{activeTransforms} transform(s) active</span>
          )}
          {pendingFlagCount > 0 && (
            <span className="badge badge-red">{pendingFlagCount} flag(s) need review</span>
          )}
        </div>

        <button
          className="btn btn-primary"
          disabled={!readyToAnalyze}
          onClick={onReadyToAnalyze}
        >
          Run Analysis →
        </button>
      </div>
    </div>
  )
}
