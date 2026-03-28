/**
 * ExplorerPanel — ad-hoc variable analysis sandbox.
 *
 * Zone 1: Column picker (grouped by question block)
 * Zone 2: Analysis buttons (reactive to selection capabilities)
 * Zone 3: Inline results (ephemeral, with pin-to-report)
 */

import { useState, useMemo, useCallback } from 'react'
import { useSelectionStore } from '../../stores/selectionStore'
import { useFindingsStore } from '../../stores/findingsStore'
import { AnalysisRegistry } from '../../plugins/AnalysisRegistry'
import { resolveColumn } from '../../engine/resolveColumn'
import { applyRowFilter } from '../../engine/rowFilter'
import { InteractiveRunner } from '../../runners/InteractiveRunner'
import { FindingCard } from '../AnalysisDisplay/FindingCard'
import { ChartContainer } from '../Charts/ChartContainer'
import { RowFilterBar } from './RowFilterBar'
import { TYPE_DESCRIPTIONS } from '../DataInput/columnTypeDescriptions'
import { generateSuggestedQuestions, type SuggestedQuestion } from '../../engine/suggestedQuestions'
import type { QuestionBlock, ColumnDefinition, Finding } from '../../types/dataTypes'
import type { PluginStepResult, AnalysisPlugin } from '../../plugins/types'
import './ExplorerPanel.css'

// Import plugins to ensure registration
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

interface ExplorerResult {
  id: string
  plugin: AnalysisPlugin
  result: PluginStepResult
  findings: Finding[]
  pinned: Set<string>
}

interface ExplorerPanelProps {
  blocks: QuestionBlock[]
}

export function ExplorerPanel({ blocks }: ExplorerPanelProps) {
  const selectedColumns = useSelectionStore((s) => s.selectedColumns)
  const segmentColumn = useSelectionStore((s) => s.segmentColumn)
  const rowFilter = useSelectionStore((s) => s.rowFilter)
  const addColumn = useSelectionStore((s) => s.addColumn)
  const removeColumn = useSelectionStore((s) => s.removeColumn)
  const setSegment = useSelectionStore((s) => s.setSegment)
  const getCapabilities = useSelectionStore((s) => s.getSelectionCapabilities)
  const addFinding = useFindingsStore((s) => s.add)

  const [results, setResults] = useState<ExplorerResult[]>([])
  const [running, setRunning] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)

  const suggestedQuestions = useMemo(
    () => generateSuggestedQuestions(blocks),
    [blocks]
  )

  // All confirmed columns
  const allColumns = useMemo(() => {
    const cols: ColumnDefinition[] = []
    for (const block of blocks) {
      if (!block.confirmed) continue
      for (const col of block.columns) cols.push(col)
    }
    return cols
  }, [blocks])

  // Segment columns (from segment-role blocks)
  const segmentColumns = useMemo(() => {
    const cols: ColumnDefinition[] = []
    for (const block of blocks) {
      if (!block.confirmed || block.role !== 'segment') continue
      for (const col of block.columns) cols.push(col)
    }
    return cols
  }, [blocks])

  // Question columns (non-segment, non-weight)
  const questionColumns = useMemo(() => {
    const cols: ColumnDefinition[] = []
    for (const block of blocks) {
      if (!block.confirmed || block.role === 'segment' || block.role === 'weight') continue
      for (const col of block.columns) cols.push(col)
    }
    return cols
  }, [blocks])

  // Row filter
  const filteredIndices = useMemo(
    () => applyRowFilter(allColumns, rowFilter),
    [allColumns, rowFilter]
  )

  // Available plugins
  const capabilities = getCapabilities()
  const allPlugins = useMemo(() => {
    // Get all registered plugins
    const allCaps = new Set([
      'continuous', 'categorical', 'ordinal', 'binary', 'segment',
      'repeated', 'n>30', 'n>100', 'text', 'temporal', 'multiple_response', 'weighted',
    ] as const)
    return AnalysisRegistry.query(allCaps as any)
      .concat(AnalysisRegistry.query(new Set())) // ensure we get everything
      .filter((p, i, arr) => arr.findIndex((q) => q.id === p.id) === i)
      .sort((a, b) => a.priority - b.priority)
  }, [])

  const availablePlugins = useMemo(
    () => AnalysisRegistry.query(capabilities),
    [capabilities]
  )
  const availableIds = useMemo(
    () => new Set(availablePlugins.map((p) => p.id)),
    [availablePlugins]
  )

  // Get unavailability reason
  const getUnavailableReason = useCallback((plugin: AnalysisPlugin): string => {
    if (selectedColumns.length === 0) return 'Select columns first'
    const missing = plugin.requires.filter((r) => !capabilities.has(r))
    if (missing.length > 0) {
      const labels: Record<string, string> = {
        segment: 'Needs a segment column',
        continuous: 'Needs continuous data',
        ordinal: 'Needs ordinal data',
        binary: 'Needs binary data',
        'n>30': 'Needs n > 30',
        'n>100': 'Needs n > 100',
      }
      return missing.map((m) => labels[m] ?? `Needs ${m}`).join(', ')
    }
    const forbidden = plugin.forbids?.filter((f) => capabilities.has(f)) ?? []
    if (forbidden.length > 0) {
      return `Not compatible with ${forbidden.join(', ')} data`
    }
    return 'Not available for this selection'
  }, [selectedColumns, capabilities])

  // Run a suggested question
  const handleRunSuggestion = useCallback(async (sq: SuggestedQuestion) => {
    if (running) return
    const plugin = AnalysisRegistry.get(sq.pluginId)
    if (!plugin) return

    // Pre-populate selection
    for (const colId of sq.columnIds) {
      const col = allColumns.find((c) => c.id === colId)
      if (col) addColumn(col)
    }
    if (sq.segmentColumnId) {
      const seg = allColumns.find((c) => c.id === sq.segmentColumnId)
      if (seg) setSegment(seg)
    }

    // Build resolved data from the suggestion's columns
    const resolvedCols = sq.columnIds
      .map((id) => allColumns.find((c) => c.id === id))
      .filter((c): c is ColumnDefinition => c !== undefined)
      .map((col) => ({ id: col.id, name: col.name, values: resolveColumn(col), nullMeaning: col.nullMeaning }))

    const resolvedSeg = sq.segmentColumnId
      ? (() => { const s = allColumns.find((c) => c.id === sq.segmentColumnId); return s ? { id: s.id, name: s.name, values: resolveColumn(s) } : undefined })()
      : undefined

    setRunning(true)
    try {
      const runner = new InteractiveRunner({
        data: { columns: resolvedCols, segment: resolvedSeg, n: resolvedCols[0]?.values.length ?? 0 },
        userId: 'explorer', dataFingerprint: 'suggestion_' + Date.now(),
        dataVersion: 1, sessionId: 'explorer',
      })
      const stepResult = await runner.runOne(plugin)
      const findings: Finding[] = stepResult.findings.map((fi, idx) => ({
        id: `suggestion_${sq.pluginId}_${Date.now()}_${idx}`,
        stepId: sq.pluginId, ...fi, adjustedPValue: null, suppressed: false,
        priority: idx, createdAt: Date.now(), dataVersion: 1, dataFingerprint: 'suggestion',
        summaryLanguage: fi.summaryLanguage || fi.summary.split('. ')[0] + '.',
      }))
      setResults((prev) => [{ id: `res_${Date.now()}`, plugin, result: stepResult, findings, pinned: new Set() }, ...prev])
    } catch (err) {
      console.error('Suggestion analysis error:', err)
    } finally {
      setRunning(false)
    }
  }, [running, allColumns, addColumn, setSegment])

  // Run analysis
  const handleRun = useCallback(async (plugin: AnalysisPlugin) => {
    if (running) return
    setRunning(true)

    try {
      // Resolve columns, applying row filter
      const resolvedCols = selectedColumns.map((col) => {
        const resolved = resolveColumn(col)
        const filtered = filteredIndices.map((i) => resolved[i] ?? null)
        return { id: col.id, name: col.name, values: filtered }
      })

      const resolvedSegment = segmentColumn
        ? {
            id: segmentColumn.id,
            name: segmentColumn.name,
            values: filteredIndices.map((i) => resolveColumn(segmentColumn)[i] ?? null),
          }
        : undefined

      const runner = new InteractiveRunner({
        data: { columns: resolvedCols, segment: resolvedSegment, n: filteredIndices.length },
        userId: 'explorer',
        dataFingerprint: 'explorer_' + Date.now(),
        dataVersion: 1,
        sessionId: 'explorer',
      })

      const stepResult = await runner.runOne(plugin)

      // Convert finding inputs to full Finding objects
      const findings: Finding[] = stepResult.findings.map((fi, idx) => ({
        id: `explorer_${plugin.id}_${Date.now()}_${idx}`,
        stepId: plugin.id,
        ...fi,
        adjustedPValue: null,
        suppressed: false,
        priority: idx,
        createdAt: Date.now(),
        summaryLanguage: fi.summaryLanguage || fi.summary.split('. ')[0] + '.',
        dataVersion: 1,
        dataFingerprint: 'explorer',
      }))

      setResults((prev) => [
        {
          id: `res_${Date.now()}`,
          plugin,
          result: stepResult,
          findings,
          pinned: new Set(),
        },
        ...prev,
      ])
    } catch (err) {
      console.error('Explorer analysis error:', err)
    } finally {
      setRunning(false)
    }
  }, [selectedColumns, segmentColumn, filteredIndices, running])

  // Pin finding to main store
  const handlePin = useCallback((resultId: string, finding: Finding) => {
    addFinding(finding)
    setResults((prev) =>
      prev.map((r) =>
        r.id === resultId
          ? { ...r, pinned: new Set([...r.pinned, finding.id]) }
          : r
      )
    )
  }, [addFinding])

  const handleClearResults = useCallback(() => {
    setResults([])
  }, [])

  const isSelected = useCallback(
    (colId: string) => selectedColumns.some((c) => c.id === colId),
    [selectedColumns]
  )

  const handleToggleColumn = useCallback(
    (col: ColumnDefinition) => {
      if (isSelected(col.id)) {
        removeColumn(col.id)
      } else {
        addColumn(col)
      }
    },
    [isSelected, addColumn, removeColumn]
  )

  return (
    <div className="explorer-panel">
      {/* Row filter bar */}
      <RowFilterBar
        allColumns={allColumns}
        filteredCount={filteredIndices.length}
        totalCount={allColumns[0]?.nRows ?? 0}
      />

      {/* Suggested questions */}
      {suggestedQuestions.length > 0 && (
        <div className="suggested-questions">
          <button className="suggested-toggle" onClick={() => setShowSuggestions(!showSuggestions)}>
            {showSuggestions ? 'Hide suggestions' : 'Show suggestions'}
          </button>
          {showSuggestions && (
            <div className="suggested-list">
              {suggestedQuestions.map((sq, i) => (
                <div key={i} className="suggested-item">
                  <div className="suggested-question">{sq.question}</div>
                  <div className="suggested-desc">{sq.analysisDescription}</div>
                  <button className="btn btn-primary btn-sm" onClick={() => handleRunSuggestion(sq)} disabled={running}>
                    Run
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="explorer-grid">
        {/* Zone 1 — Column picker */}
        <div className="explorer-picker">
          <div className="picker-header">
            <h3>Variables</h3>
            <span className="picker-count">{selectedColumns.length} selected</span>
          </div>

          {/* Question columns */}
          {blocks.filter((b) => b.confirmed && b.role === 'analyze').map((block) => (
            <div key={block.id} className="picker-group">
              <div className="picker-group-label">{block.label || block.id}</div>
              {block.columns.map((col) => (
                <label key={col.id} className={`picker-item ${isSelected(col.id) ? 'picker-item-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isSelected(col.id)}
                    onChange={() => handleToggleColumn(col)}
                  />
                  <span className="picker-col-name">{col.name}</span>
                  <span className="picker-col-type">
                    {TYPE_DESCRIPTIONS[col.format]?.label ?? col.format}
                  </span>
                </label>
              ))}
            </div>
          ))}

          {/* Segment columns */}
          {segmentColumns.length > 0 && (
            <div className="picker-group">
              <div className="picker-group-label">Segment by</div>
              {segmentColumns.map((col) => (
                <label
                  key={col.id}
                  className={`picker-item ${segmentColumn?.id === col.id ? 'picker-item-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="segment"
                    checked={segmentColumn?.id === col.id}
                    onChange={() => setSegment(segmentColumn?.id === col.id ? null : col)}
                  />
                  <span className="picker-col-name">{col.name}</span>
                  <span className="picker-col-type">Segment</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Zone 2 — Analysis buttons */}
        <div className="explorer-actions">
          <h3>Available analyses</h3>
          <div className="analysis-button-list">
            {allPlugins.map((plugin) => {
              const available = availableIds.has(plugin.id)
              return (
                <button
                  key={plugin.id}
                  className={`analysis-btn ${available ? 'analysis-btn-available' : 'analysis-btn-disabled'}`}
                  disabled={!available || running}
                  onClick={() => handleRun(plugin)}
                  title={available ? plugin.desc : getUnavailableReason(plugin)}
                >
                  <span className="analysis-btn-title">{plugin.title}</span>
                  <span className="analysis-btn-desc">
                    {available ? plugin.desc : getUnavailableReason(plugin)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Zone 3 — Inline results */}
        <div className="explorer-results">
          <div className="results-header">
            <h3>Results</h3>
            {results.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={handleClearResults}>
                Clear results
              </button>
            )}
          </div>

          {results.length === 0 && (
            <div className="explorer-empty">
              Select columns and run an analysis to see results here.
            </div>
          )}

          {results.map((r) => (
            <div key={r.id} className="explorer-result-card card">
              <div className="result-plugin-label">{r.plugin.title}</div>

              {/* Plain language */}
              {r.result.plainLanguage && (
                <p className="result-plain-language">{r.result.plainLanguage}</p>
              )}

              {/* Charts */}
              {r.result.charts.length > 0 && (
                <div className="result-charts">
                  {r.result.charts.map((chart) => (
                    <ChartContainer key={chart.id} chart={chart} />
                  ))}
                </div>
              )}

              {/* Findings */}
              {r.findings.map((f) => (
                <div key={f.id} className="result-finding-wrap">
                  <FindingCard
                    title={f.title}
                    summary={f.summary}
                    significant={f.significant}
                    pValue={f.pValue}
                    effectSize={f.effectSize}
                    effectLabel={f.effectLabel}
                  />
                  <button
                    className={`btn btn-sm ${r.pinned.has(f.id) ? 'btn-pinned' : 'btn-primary'}`}
                    disabled={r.pinned.has(f.id)}
                    onClick={() => handlePin(r.id, f)}
                  >
                    {r.pinned.has(f.id) ? 'Pinned' : 'Pin to report'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
