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
import { PrepWorkspace } from '../DataPreparation/PrepWorkspace'
import { AnalysisResults } from '../AnalysisDisplay/AnalysisResults'
import type { PastedData } from '../../parsers/adapters/PasteGridAdapter'
import type { DetectionFlag } from '../../detection/types'
import { runDetectionStatisticalOnly } from '../../detection/detectionLayer'
import { useDatasetGraphStore } from '../../stores/datasetGraph'
import { useSessionStore } from '../../stores/sessionStore'
import { useAnalysisLog } from '../../stores/analysisLog'
import { useFindingsStore } from '../../stores/findingsStore'
import type { ColumnDefinition, DatasetNode, DataGroup } from '../../types/dataTypes'
import { computeFingerprint } from '../../parsers/fingerprint'
import { resolveColumn } from '../../engine/resolveColumn'
import { CapabilityMatcher } from '../../engine/CapabilityMatcher'
import { AnalysisRegistry } from '../../plugins/AnalysisRegistry'
import { HeadlessRunner } from '../../runners/HeadlessRunner'
import type { RunResult } from '../../runners/IStepRunner'

// Import plugins to register them
import '../../plugins/FrequencyPlugin'
import '../../plugins/CrosstabPlugin'
import '../../plugins/SignificancePlugin'
import '../../plugins/PostHocPlugin'
import '../../plugins/ReliabilityPlugin'
import '../../plugins/FactorPlugin'
import '../../plugins/RegressionPlugin'
import '../../plugins/DriverPlugin'
import '../../plugins/CorrelationPlugin'
import '../../plugins/PointBiserialPlugin'
import '../../plugins/SegmentProfilePlugin'

type Step = 'paste' | 'tag' | 'prep' | 'analyzing' | 'results'

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

      setStep('prep')
    },
    [parsedData, addNode, setActiveDatasetNode, logAction]
  )

  // ---- Analysis execution ----
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const addFinding = useFindingsStore((s) => s.add)

  const handleRunAnalysis = useCallback(async () => {
    if (!activeNode) return
    setStep('analyzing')

    // Build resolved column data
    const allColumns = activeNode.parsedData.groups.flatMap((g) => g.columns)
    const resolvedColumns = allColumns.map((col) => ({
      id: col.id,
      name: col.name,
      values: resolveColumn(col),
    }))

    const segCol = activeNode.parsedData.segments
    const resolvedSegment = segCol
      ? { id: segCol.id, name: segCol.name, values: resolveColumn(segCol) }
      : undefined

    const data = {
      columns: resolvedColumns,
      segment: resolvedSegment,
      n: resolvedColumns[0]?.values.length ?? 0,
    }

    // Resolve capabilities → query plugins
    const caps = CapabilityMatcher.resolve(activeNode)
    const plugins = AnalysisRegistry.queryOrdered(caps)

    const fp = allColumns[0]?.fingerprint?.hash ?? 'unknown'

    const runner = new HeadlessRunner({
      data,
      userId: 'anonymous',
      dataFingerprint: fp,
      dataVersion: activeNode.dataVersion,
      sessionId: 'current',
    })

    const result = await runner.runAll(plugins)

    // Store findings
    for (const finding of result.findings) {
      addFinding(finding)
    }

    // Log entries
    for (const entry of runner.logEntries) {
      if (entry.type && entry.userId && entry.dataFingerprint !== undefined && entry.dataVersion !== undefined) {
        logAction({
          type: entry.type as any,
          userId: entry.userId,
          dataFingerprint: entry.dataFingerprint as string,
          dataVersion: entry.dataVersion as number,
          sessionId: entry.sessionId as string ?? 'current',
          payload: entry.payload as Record<string, unknown>,
        })
      }
    }

    setRunResult(result)
    setStep('results')
  }, [activeNode, addFinding, logAction])

  const handleStartOver = useCallback(() => {
    setParsedData(null)
    setDetectionFlags([])
    setRunResult(null)
    setStep('paste')
  }, [])

  return (
    <div className="data-workspace">
      {/* Step indicator */}
      <div className="step-indicator">
        <StepDot active={step === 'paste'} done={step !== 'paste'} label="1. Paste" />
        <StepDot active={step === 'tag'} done={step === 'prep' || step === 'analyzing' || step === 'results'} label="2. Tag" />
        <StepDot active={step === 'prep'} done={step === 'analyzing' || step === 'results'} label="3. Prepare" />
        <StepDot active={step === 'analyzing' || step === 'results'} done={step === 'results'} label="4. Analyze" />
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

      {step === 'prep' && activeNode && (
        <PrepWorkspace
          node={activeNode}
          detectionFlags={detectionFlags}
          onReadyToAnalyze={handleRunAnalysis}
        />
      )}

      {step === 'analyzing' && (
        <div className="analyzing-state card">
          <div className="analyzing-content">
            <div className="analyzing-spinner" />
            <h2>Running Analysis...</h2>
            <p>Processing all applicable plugins</p>
          </div>
        </div>
      )}

      {step === 'results' && runResult && (
        <>
          <AnalysisResults runResult={runResult} />
          <div className="results-footer">
            <button className="btn btn-secondary" onClick={handleStartOver}>
              New Analysis
            </button>
          </div>
        </>
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
