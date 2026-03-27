/**
 * DataWorkspace — orchestrates the paste → parse → tag → store flow.
 *
 * Pipeline:
 *   1. PasteGrid captures raw text, parses via ParserRegistry
 *   2. DetectionLayer runs statistical checks on parsed columns
 *   3. ColumnTagger shows columns with detection flags, user confirms types
 *   4. On confirm: builds DatasetNode, pushes to DatasetGraph store
 */

import { useState, useCallback } from 'react'
import './DataWorkspace.css'
import { PasteGrid } from './PasteGrid'
import { ColumnTagger, type ColumnTag } from './ColumnTagger'
import type { PastedData } from '../../parsers/adapters/PasteGridAdapter'
import type { DetectionFlag } from '../../detection/types'
import { runDetectionStatisticalOnly } from '../../detection/detectionLayer'
import { useDatasetGraphStore } from '../../stores/datasetGraph'
import { useSessionStore } from '../../stores/sessionStore'
import { useAnalysisLog } from '../../stores/analysisLog'
import type { ColumnDefinition, DatasetNode, DataGroup } from '../../types/dataTypes'
import { computeFingerprint } from '../../parsers/fingerprint'

type Step = 'paste' | 'tag' | 'ready'

export function DataWorkspace() {
  const [step, setStep] = useState<Step>('paste')
  const [parsedData, setParsedData] = useState<PastedData | null>(null)
  const [detectionFlags, setDetectionFlags] = useState<DetectionFlag[]>([])

  const addNode = useDatasetGraphStore((s) => s.addNode)
  const setActiveDatasetNode = useSessionStore((s) => s.setActiveDatasetNode)
  const logAction = useAnalysisLog((s) => s.log)
  const activeNodeId = useSessionStore((s) => s.activeDatasetNodeId)
  const nodes = useDatasetGraphStore((s) => s.nodes)
  const activeNode = nodes.find((n) => n.id === activeNodeId)

  const handleDataParsed = useCallback((data: PastedData) => {
    if (!data) {
      setParsedData(null)
      setDetectionFlags([])
      setStep('paste')
      return
    }

    setParsedData(data)

    // Build temporary ColumnDefinitions for detection
    const tempColumns: ColumnDefinition[] = data.columns.map((col) => ({
      id: col.id,
      name: col.name,
      type: 'rating',
      nRows: col.values.length,
      nMissing: col.values.filter((v) => v === null).length,
      rawValues: col.values,
      fingerprint: col.fingerprint,
      semanticDetectionCache: null,
      transformStack: [],
      sensitivity: 'anonymous',
      declaredScaleRange: null,
    }))

    // Run statistical detection
    const result = runDetectionStatisticalOnly({ columns: tempColumns })
    setDetectionFlags(result.flags)

    setStep('tag')
  }, [])

  const handleTagsConfirmed = useCallback(
    (tags: ColumnTag[]) => {
      if (!parsedData) return

      // Build ColumnDefinitions from confirmed tags
      const segmentTag = tags.find((t) => t.isSegment)
      let segmentCol: ColumnDefinition | undefined

      const dataColumns: ColumnDefinition[] = []

      for (const col of parsedData.columns) {
        const tag = tags.find((t) => t.columnId === col.id)
        if (!tag) continue

        const colDef: ColumnDefinition = {
          id: col.id,
          name: col.name,
          type: tag.type,
          nRows: col.values.length,
          nMissing: col.values.filter((v) => v === null).length,
          rawValues: col.values,
          fingerprint: col.fingerprint ?? computeFingerprint(col.values, col.id),
          semanticDetectionCache: null,
          transformStack: [],
          sensitivity: 'anonymous',
          declaredScaleRange:
            tag.scaleMin !== null && tag.scaleMax !== null
              ? [tag.scaleMin, tag.scaleMax]
              : null,
        }

        if (tag.isSegment) {
          segmentCol = { ...colDef, type: 'category' }
        } else {
          dataColumns.push(colDef)
        }
      }

      // Group columns by type
      const groups: DataGroup[] = []
      const byType = new Map<string, ColumnDefinition[]>()
      for (const col of dataColumns) {
        const key = col.type
        if (!byType.has(key)) byType.set(key, [])
        byType.get(key)!.push(col)
      }
      for (const [type, cols] of byType) {
        groups.push({
          questionType: type as ColumnDefinition['type'],
          columns: cols,
          label: `${type} items`,
        })
      }

      // Build and store DatasetNode
      const nodeId = 'node_' + Date.now()
      const node: DatasetNode = {
        id: nodeId,
        label: 'Dataset',
        parsedData: {
          groups,
          segments: segmentCol,
        },
        weights: null,
        readonly: false,
        source: 'user',
        dataVersion: 1,
        createdAt: Date.now(),
      }

      addNode(node)
      setActiveDatasetNode(nodeId)

      // Log the parse completion
      const fp = dataColumns[0]?.fingerprint?.hash ?? 'unknown'
      logAction({
        type: 'parse_completed',
        userId: 'anonymous',
        dataFingerprint: fp,
        dataVersion: 1,
        sessionId: 'current',
        payload: {
          nColumns: dataColumns.length,
          nRows: parsedData.nRows,
          hasSegment: !!segmentCol,
          format: parsedData.format,
        },
      })

      setStep('ready')
    },
    [parsedData, addNode, setActiveDatasetNode, logAction]
  )

  return (
    <div className="data-workspace">
      {/* Step indicator */}
      <div className="step-indicator">
        <StepDot active={step === 'paste'} done={step !== 'paste'} label="1. Paste Data" />
        <StepDot active={step === 'tag'} done={step === 'ready'} label="2. Tag Columns" />
        <StepDot active={step === 'ready'} done={false} label="3. Analyze" />
      </div>

      {/* Current step content */}
      {step === 'paste' && (
        <PasteGrid onDataParsed={handleDataParsed} parsedData={parsedData} />
      )}

      {step === 'tag' && parsedData && (
        <>
          <PasteGrid onDataParsed={handleDataParsed} parsedData={parsedData} />
          <ColumnTagger
            parsedData={parsedData}
            detectionFlags={detectionFlags}
            onTagsConfirmed={handleTagsConfirmed}
          />
        </>
      )}

      {step === 'ready' && activeNode && (
        <div className="ready-state card">
          <div className="ready-content">
            <h2>Data Ready</h2>
            <p>
              {activeNode.parsedData.groups.reduce((s, g) => s + g.columns.length, 0)} columns tagged
              {activeNode.parsedData.segments ? ` · Segment: ${activeNode.parsedData.segments.name}` : ''}
              {' · '}{activeNode.parsedData.groups[0]?.columns[0]?.nRows ?? 0} rows
            </p>
            <div className="ready-actions">
              <button className="btn btn-primary" disabled>
                Continue to Data Preparation →
              </button>
              <button className="btn btn-secondary" onClick={() => {
                setParsedData(null)
                setDetectionFlags([])
                setStep('paste')
              }}>
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`step-dot ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
      <div className="dot" />
      <span>{label}</span>
    </div>
  )
}
