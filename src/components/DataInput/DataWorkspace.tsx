/**
 * DataWorkspace — orchestrates the full analysis pipeline.
 *
 * New flow (Layer 2 architecture):
 *   1. Question blocks — user pastes each question in its own box
 *   2. Task review — system proposes tasks, user confirms/skips (judgment surface)
 *   3. Analyzing — runner executes confirmed tasks
 *   4. Results — step cards with charts and findings
 *   5. Report — schema editor + export
 */

import { useState, useCallback } from 'react'
import './DataWorkspace.css'
import { QuestionBlockEntry } from './QuestionBlockEntry'
import { TaskReview } from './TaskReview'
import { AnalysisResults } from '../AnalysisDisplay/AnalysisResults'
import { ReportBuilder } from '../Report/ReportBuilder'
import { ExplorerPanel } from '../Explorer/ExplorerPanel'
import type { QuestionBlock, AnalysisTask, DatasetNode, DataGroup } from '../../types/dataTypes'
import { useDatasetGraphStore } from '../../stores/datasetGraph'
import { useSessionStore } from '../../stores/sessionStore'
import { useAnalysisLog } from '../../stores/analysisLog'
import { useFindingsStore } from '../../stores/findingsStore'
import { useChartStore } from '../../stores/chartStore'
import { resolveColumn } from '../../engine/resolveColumn'
import { AnalysisRegistry } from '../../plugins/AnalysisRegistry'
import { HeadlessRunner } from '../../runners/HeadlessRunner'
import { extractWeights } from '../../engine/weightExtractor'
import { proposeTasks } from '../../engine/TaskProposer'
import { buildAnalysisPlan, proposeTasksFromPlan } from '../../engine/analysisPlan'
import { AnalysisPlanCard } from '../AnalysisPlanCard'
import type { AnalysisPlan } from '../../types/dataTypes'
import type { RunResult } from '../../runners/IStepRunner'

// Register all plugins
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
import '../../plugins/DescriptivesPlugin'
import '../../plugins/DescriptivesSummaryPlugin'
import '../../plugins/LogisticRegressionPlugin'
import '../../plugins/ANOVAPlugin'

type Step = 'blocks' | 'review' | 'analyzing' | 'results' | 'report'

export function DataWorkspace() {
  const [step, setStep] = useState<Step>('blocks')
  const [questionBlocks, setQuestionBlocks] = useState<QuestionBlock[]>([])
  const [proposedTasks, setProposedTasks] = useState<AnalysisTask[]>([])
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [taskStepResults, setTaskStepResults] = useState<Record<string, import('../../plugins/types').PluginStepResult>>({})
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [resultsTab, setResultsTab] = useState<'results' | 'explore'>('results')
  const [analysisPlan, setAnalysisPlan] = useState<AnalysisPlan | null>(null)

  const addNode = useDatasetGraphStore((s) => s.addNode)
  const setActiveDatasetNode = useSessionStore((s) => s.setActiveDatasetNode)
  const logAction = useAnalysisLog((s) => s.log)
  const addFinding = useFindingsStore((s) => s.add)
  const addChart = useChartStore((s) => s.addChart)

  // ---- Step 1 → Step 2: blocks confirmed → propose tasks ----
  const handleBlocksConfirmed = useCallback((blocks: QuestionBlock[]) => {
    setQuestionBlocks(blocks)

    // Store dataset node for the store system
    const questions = blocks.filter((b) => b.role === 'analyze')
    const behavioralBlocks = blocks.filter((b) => b.role === 'metric')
    const segBlock = blocks.find((b) => b.role === 'segment')
    const weightBlock = blocks.find((b) => b.role === 'weight')

    const groups: DataGroup[] = [
      ...questions.map((block) => ({
        format: block.format,
        columns: block.columns,
        label: block.label || `${block.format} items`,
        scaleRange: block.scaleRange,
      })),
      ...behavioralBlocks.map((block) => ({
        format: block.format,
        columns: block.columns,
        label: block.label || 'Behavioral data',
      })),
    ]

    const nodeId = 'node_' + Date.now()
    const firstCol = questions[0]?.columns[0] ?? behavioralBlocks[0]?.columns[0]
    const node: DatasetNode = {
      id: nodeId,
      label: 'Dataset',
      parsedData: {
        groups,
        segments: segBlock?.columns[0],
      },
      rowCount: firstCol?.nRows ?? 0,
      weights: weightBlock?.columns[0] ?? null,
      readonly: false,
      source: 'user',
      dataVersion: 1,
      createdAt: Date.now(),
      activeSubgroup: null,
    }

    addNode(node)
    setActiveDatasetNode(nodeId)

    const fp = questions[0]?.columns[0]?.fingerprint?.hash ?? 'unknown'
    logAction({
      type: 'parse_completed',
      userId: 'anonymous',
      dataFingerprint: fp,
      dataVersion: 1,
      sessionId: 'current',
      payload: {
        nQuestions: questions.length,
        hasSegment: !!segBlock,
        questionTypes: questions.map((b) => b.questionType),
      },
    })

    // Build analysis plan and propose tasks
    const plan = buildAnalysisPlan(blocks)
    setAnalysisPlan(plan)
    const tasks = proposeTasksFromPlan(plan)
    setProposedTasks(tasks)
    setStep('review')
  }, [addNode, setActiveDatasetNode, logAction])

  // ---- Step 2 → Step 3: tasks confirmed → execute ----
  const handleTasksConfirmed = useCallback(async (tasks: AnalysisTask[]) => {
    const confirmed = tasks.filter((t) => t.status === 'proposed')
    if (confirmed.length === 0) {
      setAnalysisError('No tasks selected. Go back and include at least one analysis.')
      return
    }

    setStep('analyzing')
    setAnalysisError(null)

    try {
      const allStepResults: RunResult['stepResults'] = []
      const allFindings: RunResult['findings'] = []
      const completedPlugins: string[] = []
      const skippedPlugins: string[] = []
      const taskStepMap: Record<string, import('../../plugins/types').PluginStepResult> = {}
      const startTime = performance.now()

      // Build a lookup from questionBlockId → block
      const blockMap = new Map(questionBlocks.map((b) => [b.id, b]))

      // Extract weights if a weight block exists
      const weightBlock = questionBlocks.find((b) => b.role === 'weight')
      const weightCol = weightBlock?.columns[0] ?? null
      const weightResult = extractWeights(
        weightCol,
        questionBlocks.find((b) => b.role === 'analyze')?.columns[0]?.nRows ?? 0,
        'anonymous', 'fp', 1, 'current'
      )

      // Execute tasks in order (respecting dependsOn)
      const executed = new Set<string>()

      // Simple dependency-respecting execution: keep iterating until all done
      const pending = [...confirmed]
      let safetyCounter = 0

      while (pending.length > 0 && safetyCounter < 100) {
        safetyCounter++
        const nextIdx = pending.findIndex((t) =>
          t.dependsOn.every((dep) => executed.has(dep) || !confirmed.some((c) => c.id === dep))
        )
        if (nextIdx === -1) break // circular dependency or unresolvable

        const task = pending.splice(nextIdx, 1)[0]
        const plugin = AnalysisRegistry.get(task.pluginId)

        if (!plugin) {
          skippedPlugins.push(task.pluginId)
          executed.add(task.id)
          continue
        }

        // Resolve task inputs to ResolvedColumnData
        const resolvedColumns = task.inputs.columns
          .map((ref) => {
            const block = blockMap.get(ref.questionBlockId)
            const col = block?.columns.find((c) => c.id === ref.columnId)
            if (!col) return null
            return { id: col.id, name: col.name, values: resolveColumn(col), nullMeaning: col.nullMeaning }
          })
          .filter((c): c is NonNullable<typeof c> => c !== null)

        // Resolve outcome (prepend to columns for regression/driver)
        if (task.inputs.outcome) {
          const block = blockMap.get(task.inputs.outcome.questionBlockId)
          const col = block?.columns.find((c) => c.id === task.inputs.outcome!.columnId)
          if (col) {
            resolvedColumns.unshift({ id: col.id, name: col.name, values: resolveColumn(col), nullMeaning: col.nullMeaning })
          }
        }

        // Resolve segment
        let resolvedSegment: { id: string; name: string; values: (number | string | null)[]; nullMeaning?: import('../../types/dataTypes').NullMeaning } | undefined = undefined
        if (task.inputs.segment) {
          const block = blockMap.get(task.inputs.segment.questionBlockId)
          const col = block?.columns.find((c) => c.id === task.inputs.segment!.columnId)
          if (col) {
            resolvedSegment = { id: col.id, name: col.name, values: resolveColumn(col), nullMeaning: col.nullMeaning }
          }
        }

        const data = {
          columns: resolvedColumns,
          segment: resolvedSegment,
          n: resolvedColumns[0]?.values.length ?? 0,
          rowCount: resolvedColumns[0]?.values.length ?? 0,
          weights: weightResult.weights,
          weightColumnName: weightResult.weightColumnName,
        }

        const fp = resolvedColumns[0]?.id ?? 'unknown'

        const runner = new HeadlessRunner({
          data,
          weights: weightResult.weights,
          userId: 'anonymous',
          dataFingerprint: fp,
          dataVersion: 1,
          sessionId: 'current',
        })

        try {
          const result = await runner.runOne(plugin)
          allStepResults.push(result)
          completedPlugins.push(task.pluginId)
          taskStepMap[task.id] = result

          // Derive question label from source blocks — exclude segment/dimension blocks
          const questionBlockLabels = task.sourceQuestionIds
            .map((qid) => blockMap.get(qid))
            .filter((block): block is import('../../types/dataTypes').QuestionBlock => {
              if (!block) return false
              return block.role !== 'segment' && block.role !== 'dimension'
            })
            .map((block) => block.label)
          const questionLabel = questionBlockLabels[0] ?? task.label ?? ''

          for (const fi of result.findings) {
            const finding = {
              id: `finding_${task.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              stepId: task.pluginId,
              ...fi,
              adjustedPValue: null,
              suppressed: false,
              priority: allFindings.length,
              createdAt: Date.now(),
              dataVersion: 1,
              dataFingerprint: fp,
              weightedBy: weightResult.weightColumnName,
              sourceTaskId: task.id,
              sourceColumns: resolvedColumns.map((c) => c.name),
              sourceQuestionLabel: questionLabel,
              crossType: task.crossType,
              summaryLanguage: fi.summaryLanguage || fi.summary.split('. ')[0] + '.',
            }
            allFindings.push(finding)
            addFinding(finding)
          }

          for (const chart of result.charts) {
            addChart(chart)
          }
        } catch (err) {
          skippedPlugins.push(task.pluginId)
          console.error(`Task ${task.id} failed:`, err)
        }

        executed.add(task.id)
      }

      const runResult: RunResult = {
        stepResults: allStepResults,
        findings: allFindings,
        violations: [],
        completedPlugins,
        skippedPlugins,
        durationMs: performance.now() - startTime,
        questionOrder: questionBlocks.map((b) => b.label),
      }

      setRunResult(runResult)
      setTaskStepResults(taskStepMap)
      setStep('results')
    } catch (err) {
      console.error('Analysis failed:', err)
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed unexpectedly.')
      setStep('review')
    }
  }, [questionBlocks, addFinding, addChart])

  // ---- Navigation ----
  const handleStartOver = useCallback(() => {
    setQuestionBlocks([])
    setProposedTasks([])
    setRunResult(null)
    setTaskStepResults({})
    setAnalysisError(null)
    setAnalysisPlan(null)
    setStep('blocks')
  }, [])

  return (
    <div className="data-workspace">
      {/* Step indicator */}
      <div className="step-indicator">
        <StepDot active={step === 'blocks'} done={step !== 'blocks'} label="1. Questions" />
        <StepDot active={step === 'review'} done={['analyzing', 'results', 'report'].includes(step)} label="2. Review Plan" />
        <StepDot active={step === 'analyzing' || step === 'results'} done={step === 'report'} label="3. Results" />
        <StepDot active={step === 'report'} done={false} label="4. Report" />
      </div>

      {/* Step content */}
      {step === 'blocks' && (
        <QuestionBlockEntry onBlocksConfirmed={handleBlocksConfirmed} />
      )}

      {step === 'review' && (
        <>
          {analysisError && (
            <div className="analysis-error card">
              <strong>Error:</strong> {analysisError}
            </div>
          )}
          {analysisPlan && (
            <AnalysisPlanCard
              plan={analysisPlan}
              onRun={(confirmedTier5) => {
                // Mark confirmed Tier 5 tasks
                const updated = proposedTasks.map((t) =>
                  confirmedTier5.includes(t.id) ? { ...t, status: 'confirmed' as const } : t
                )
                handleTasksConfirmed(updated)
              }}
              onOpenExplorer={() => { setStep('results'); setResultsTab('explore') }}
            />
          )}
          <TaskReview
            tasks={proposedTasks}
            blocks={questionBlocks}
            onConfirmed={handleTasksConfirmed}
          />
        </>
      )}

      {step === 'analyzing' && (
        <div className="analyzing-state card">
          <div className="analyzing-content">
            <div className="analyzing-spinner" />
            <h2>Running Analysis...</h2>
            <p>Executing confirmed tasks</p>
          </div>
        </div>
      )}

      {step === 'results' && runResult && (
        <>
          <div className="results-tab-bar">
            <button
              className={`results-tab ${resultsTab === 'results' ? 'results-tab-active' : ''}`}
              onClick={() => setResultsTab('results')}
            >
              Results
            </button>
            <button
              className={`results-tab ${resultsTab === 'explore' ? 'results-tab-active' : ''}`}
              onClick={() => setResultsTab('explore')}
            >
              Explore
            </button>
          </div>

          {resultsTab === 'results' && <AnalysisResults runResult={runResult} taskStepResults={taskStepResults} />}
          {resultsTab === 'explore' && <ExplorerPanel blocks={questionBlocks} />}

          <div className="results-footer">
            <button className="btn btn-primary" onClick={() => setStep('report')}>
              Build Report →
            </button>
            <button className="btn btn-secondary" onClick={() => setStep('review')}>
              ← Back to Plan
            </button>
            <button className="btn btn-secondary" onClick={handleStartOver}>
              New Analysis
            </button>
          </div>
        </>
      )}

      {step === 'report' && (
        <>
          <ReportBuilder />
          <div className="results-footer">
            <button className="btn btn-secondary" onClick={() => setStep('results')}>
              ← Back to Results
            </button>
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
