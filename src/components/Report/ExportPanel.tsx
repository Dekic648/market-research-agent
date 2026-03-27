/**
 * ExportPanel — trigger report export in various formats.
 * Also provides FDR correction before export.
 */

import { useState } from 'react'
import { useFindingsStore } from '../../stores/findingsStore'
import type { ReportSchema } from '../../report/schema/ReportSchema'
import { JSONRenderer, type RenderContext } from '../../report/renderer/ReportRenderer'
import type { Finding, ChartConfig } from '../../types/dataTypes'
import { useChartStore } from '../../stores/chartStore'
import './Report.css'

interface ExportPanelProps {
  schema: ReportSchema
}

export function ExportPanel({ schema }: ExportPanelProps) {
  const findings = useFindingsStore((s) => s.findings)
  const applyFDR = useFindingsStore((s) => s.applyFDRCorrection)
  const chartConfigs = useChartStore((s) => s.configs)
  const [fdrApplied, setFdrApplied] = useState(false)
  const [exported, setExported] = useState(false)

  const sigFindings = findings.filter((f) => f.pValue !== null)

  const handleFDR = (method: 'bonferroni' | 'bh') => {
    applyFDR(method)
    setFdrApplied(true)
  }

  const handleExportJSON = () => {
    const findingsMap = new Map<string, Finding>()
    for (const f of findings) findingsMap.set(f.id, f)

    const chartsMap = new Map<string, ChartConfig>()
    for (const [id, config] of Object.entries(chartConfigs)) chartsMap.set(id, config)

    const context: RenderContext = {
      findings: findingsMap,
      charts: chartsMap,
      metadata: {
        title: 'Analysis Report',
        date: new Date().toISOString().slice(0, 10),
        author: 'anonymous',
      },
    }

    const renderer = new JSONRenderer()
    const result = renderer.render(schema, context)

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExported(true)
  }

  return (
    <div className="export-panel">
      <h3>Export Report</h3>

      {/* FDR Correction */}
      {sigFindings.length >= 5 && !fdrApplied && (
        <div className="fdr-prompt">
          <p>
            {sigFindings.length} significance tests detected.
            Apply multiple comparison correction before exporting?
          </p>
          <div className="fdr-buttons">
            <button className="btn btn-secondary" onClick={() => handleFDR('bh')}>
              Benjamini-Hochberg (recommended)
            </button>
            <button className="btn btn-secondary" onClick={() => handleFDR('bonferroni')}>
              Bonferroni (conservative)
            </button>
          </div>
        </div>
      )}

      {fdrApplied && (
        <div className="fdr-applied badge badge-teal">FDR correction applied</div>
      )}

      {/* Export buttons */}
      <div className="export-buttons">
        <button className="btn btn-primary" onClick={handleExportJSON}>
          Export JSON Report
        </button>
        <button className="btn btn-secondary" disabled title="Coming soon">
          Export PDF
        </button>
        <button className="btn btn-secondary" disabled title="Coming soon">
          Export PPTX
        </button>
      </div>

      {exported && (
        <p className="export-success">Report exported successfully.</p>
      )}

      <div className="export-info">
        <p>
          {schema.sections.length} section(s) in report.
          JSON export available now. PDF and PPTX renderers coming soon.
        </p>
      </div>
    </div>
  )
}
