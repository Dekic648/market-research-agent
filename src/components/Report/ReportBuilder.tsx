/**
 * ReportBuilder — schema editor UI. Not a renderer.
 *
 * Assembles a ReportSchema from findings, charts, and user narrative.
 * The schema is then passed to renderers for export.
 */

import { useState, useCallback, useMemo } from 'react'
import { FindingsList } from './FindingsList'
import { ChartSelector } from './ChartSelector'
import { SectionEditor } from './SectionEditor'
import { ExportPanel } from './ExportPanel'
import {
  createReportSchema,
  type ReportSchema,
  type ReportSection,
} from '../../report/schema/ReportSchema'
import { useSessionStore } from '../../stores/sessionStore'
import { useAnalysisLog } from '../../stores/analysisLog'
import './Report.css'

export function ReportBuilder() {
  const sessionId = useSessionStore((s) => s.sessionId)
  const logEntries = useAnalysisLog((s) => s.entries)

  const [schema, setSchema] = useState<ReportSchema>(() =>
    createReportSchema({
      createdBy: 'anonymous',
      sourceDatasetIds: [],
      analysisLogSnapshot: logEntries.map((e) => e.id),
    })
  )

  const [includedFindings, setIncludedFindings] = useState<Set<string>>(new Set())
  const [includedCharts, setIncludedCharts] = useState<Set<string>>(new Set())

  const handleIncludeFinding = useCallback((findingId: string) => {
    setIncludedFindings((prev) => {
      const next = new Set(prev)
      if (next.has(findingId)) {
        next.delete(findingId)
        // Remove from sections
        setSchema((s) => ({
          ...s,
          sections: s.sections.filter(
            (sec) => !(sec.type === 'finding' && sec.findingId === findingId)
          ),
        }))
      } else {
        next.add(findingId)
        // Add to sections
        setSchema((s) => ({
          ...s,
          sections: [...s.sections, { type: 'finding', findingId }],
        }))
      }
      return next
    })
  }, [])

  const handleIncludeChart = useCallback((chartId: string) => {
    setIncludedCharts((prev) => {
      const next = new Set(prev)
      if (next.has(chartId)) {
        next.delete(chartId)
        setSchema((s) => ({
          ...s,
          sections: s.sections.filter(
            (sec) => !(sec.type === 'chart' && sec.chartId === chartId)
          ),
        }))
      } else {
        next.add(chartId)
        setSchema((s) => ({
          ...s,
          sections: [...s.sections, { type: 'chart', chartId }],
        }))
      }
      return next
    })
  }, [])

  const handleUpdateSections = useCallback((sections: ReportSection[]) => {
    setSchema((s) => ({ ...s, sections }))
  }, [])

  const handleAddExecutiveSummary = useCallback(() => {
    const findingRefs = Array.from(includedFindings)
    if (findingRefs.length === 0) return
    setSchema((s) => ({
      ...s,
      sections: [
        { type: 'executive_summary', findingRefs },
        ...s.sections,
      ],
    }))
  }, [includedFindings])

  return (
    <div className="report-builder">
      <div className="report-builder-header card">
        <h2>Report Builder</h2>
        <p>Select findings and charts, add commentary, then export.</p>
        {includedFindings.size > 0 && (
          <button className="btn btn-secondary" onClick={handleAddExecutiveSummary}>
            Add Executive Summary
          </button>
        )}
      </div>

      <div className="report-builder-grid">
        <div className="report-builder-sidebar">
          <FindingsList
            onIncludeFinding={handleIncludeFinding}
            includedIds={includedFindings}
          />
          <ChartSelector
            onIncludeChart={handleIncludeChart}
            includedIds={includedCharts}
          />
        </div>

        <div className="report-builder-main">
          <SectionEditor
            sections={schema.sections}
            onUpdateSections={handleUpdateSections}
          />
          <ExportPanel schema={schema} />
        </div>
      </div>
    </div>
  )
}
