/**
 * ReportRenderer — interface for all output formats.
 *
 * Rule: no renderer contains business logic. The renderer only executes.
 * Conditional display is already resolved before render() is called.
 */

import type { ReportSchema, ReportSection } from '../schema/ReportSchema'
import type { Finding, ChartConfig } from '../../types/dataTypes'

export interface RenderContext {
  findings: Map<string, Finding>
  charts: Map<string, ChartConfig>
  metadata: {
    title?: string
    subtitle?: string
    author?: string
    date?: string
  }
}

export interface RenderedSection {
  type: ReportSection['type']
  content: string          // rendered content (HTML, markdown, etc.)
  chartData?: unknown      // for chart sections — Plotly data for the renderer
}

export interface RenderedReport {
  format: string
  sections: RenderedSection[]
  metadata: RenderContext['metadata']
  generatedAt: number
}

/**
 * Base renderer interface — all format renderers implement this.
 */
export interface ReportRenderer {
  format: string
  render(schema: ReportSchema, context: RenderContext): RenderedReport
}

/**
 * JSON renderer — the simplest renderer, useful for debugging and testing.
 * Resolves all references and produces a flat JSON document.
 */
export class JSONRenderer implements ReportRenderer {
  format = 'json'

  render(schema: ReportSchema, context: RenderContext): RenderedReport {
    const sections: RenderedSection[] = []

    for (const section of schema.sections) {
      sections.push(this.renderSection(section, context))
    }

    return {
      format: 'json',
      sections,
      metadata: context.metadata,
      generatedAt: Date.now(),
    }
  }

  private renderSection(section: ReportSection, context: RenderContext): RenderedSection {
    switch (section.type) {
      case 'executive_summary': {
        const findings = section.findingRefs
          .map((id) => context.findings.get(id))
          .filter((f): f is Finding => f !== undefined)
        return {
          type: 'executive_summary',
          content: findings.map((f) => `• ${f.summary}`).join('\n'),
        }
      }

      case 'finding': {
        const finding = context.findings.get(section.findingId)
        return {
          type: 'finding',
          content: finding
            ? `**${finding.title}**\n${finding.summary}\n${finding.detail}`
            : `[Finding ${section.findingId} not found]`,
        }
      }

      case 'chart': {
        const chart = context.charts.get(section.chartId)
        return {
          type: 'chart',
          content: section.caption ?? chart?.edits.title ?? '',
          chartData: chart ? { data: chart.data, layout: chart.layout } : undefined,
        }
      }

      case 'narrative':
        return { type: 'narrative', content: section.text }

      case 'ai_narrative':
        return {
          type: 'ai_narrative',
          content: section.cachedResult ?? '[AI narrative not yet generated]',
        }

      case 'segment_profile':
        return { type: 'segment_profile', content: `Segment profile: ${section.segmentId}` }

      case 'driver':
        return { type: 'driver', content: `Driver analysis: ${section.outcomeVariable}` }

      case 'conditional':
        // Should be resolved before reaching renderer — render inner section
        return this.renderSection(section.section, context)
    }
  }
}
