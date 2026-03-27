/**
 * SectionEditor — manages the ordered list of report sections.
 * Users can add narrative text, reorder sections, and remove them.
 */

import { useState } from 'react'
import type { ReportSection } from '../../report/schema/ReportSchema'
import './Report.css'

interface SectionEditorProps {
  sections: ReportSection[]
  onUpdateSections: (sections: ReportSection[]) => void
}

export function SectionEditor({ sections, onUpdateSections }: SectionEditorProps) {
  const [narrativeText, setNarrativeText] = useState('')

  const addNarrative = () => {
    if (!narrativeText.trim()) return
    onUpdateSections([...sections, { type: 'narrative', text: narrativeText.trim() }])
    setNarrativeText('')
  }

  const removeSection = (index: number) => {
    onUpdateSections(sections.filter((_, i) => i !== index))
  }

  const moveSection = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return
    const updated = [...sections]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    onUpdateSections(updated)
  }

  return (
    <div className="section-editor">
      <h3>Report Sections ({sections.length})</h3>

      {sections.length === 0 && (
        <p className="empty-message">Add findings, charts, or narrative text to build your report.</p>
      )}

      <div className="section-list">
        {sections.map((section, i) => (
          <div key={i} className="section-row">
            <div className="section-order-btns">
              <button onClick={() => moveSection(i, i - 1)} disabled={i === 0}>↑</button>
              <button onClick={() => moveSection(i, i + 1)} disabled={i === sections.length - 1}>↓</button>
            </div>

            <div className="section-content">
              <span className="section-type-badge">{section.type}</span>
              <span className="section-preview">
                {sectionPreview(section)}
              </span>
            </div>

            <button className="section-remove" onClick={() => removeSection(i)} title="Remove">
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="add-narrative">
        <textarea
          placeholder="Add commentary or narrative text..."
          value={narrativeText}
          onChange={(e) => setNarrativeText(e.target.value)}
          rows={3}
        />
        <button className="btn btn-secondary" onClick={addNarrative} disabled={!narrativeText.trim()}>
          Add Narrative
        </button>
      </div>
    </div>
  )
}

function sectionPreview(section: ReportSection): string {
  switch (section.type) {
    case 'executive_summary': return `Executive Summary (${section.findingRefs.length} findings)`
    case 'finding': return `Finding: ${section.findingId}`
    case 'chart': return `Chart: ${section.chartId}${section.caption ? ` — ${section.caption}` : ''}`
    case 'narrative': return section.text.length > 80 ? section.text.slice(0, 77) + '...' : section.text
    case 'ai_narrative': return 'AI-generated narrative'
    case 'segment_profile': return `Segment profile: ${section.segmentId}`
    case 'driver': return `Driver analysis: ${section.outcomeVariable}`
    case 'conditional': return `Conditional: ${section.showIf}`
  }
}
