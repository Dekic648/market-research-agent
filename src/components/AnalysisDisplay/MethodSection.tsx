/**
 * MethodSection — collapsible section grouping question blocks by analysis method.
 * E.g., "Distributions" contains all frequency analyses, "Group Comparisons" contains KW + posthoc.
 */

import { useState, useEffect } from 'react'
import { ResultQuestionBlock } from './ResultQuestionBlock'
import { SectionSummaryCard } from './SectionSummaryCard'
import type { MethodSectionData } from '../../results/groupFindings'
import type { Finding } from '../../types/dataTypes'

interface MethodSectionProps {
  section: MethodSectionData
  defaultOpen: boolean
  /** When this changes, force all sections to the given state */
  forceState?: { collapsed: boolean; key: number }
  onOpenTLDR?: () => void
  /** When true, non-significant blocks render with muted treatment */
  showNonSig?: boolean
}

export function MethodSection({ section, defaultOpen, forceState, onOpenTLDR, showNonSig }: MethodSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (forceState) setOpen(!forceState.collapsed)
  }, [forceState])

  const groupCount = section.questionGroups.length
  const collapsibleBlocks = groupCount >= 4

  return (
    <div className="method-section">
      <div className="method-section-header" onClick={() => setOpen(!open)}>
        <span className="method-section-toggle">{open ? '▾' : '▸'}</span>
        <h3 className="method-section-title">{section.label}</h3>
        <span className="method-section-count">
          {section.findingCount} finding{section.findingCount !== 1 ? 's' : ''}
        </span>
      </div>

      {open && (
        <div className="method-section-body">
          {section.questionGroups.map((group) => (
            <ResultQuestionBlock
              key={group.questionKey}
              group={group}
              defaultOpen={group.primarySignificant || !collapsibleBlocks}
              collapsible={collapsibleBlocks}
              mutedNonSig={showNonSig && !group.primarySignificant}
            />
          ))}
          {/* Section summary — top findings in plain language */}
          <SectionSummaryCard
            findings={section.questionGroups.flatMap((g) => g.findings) as Finding[]}
            onOpenTLDR={onOpenTLDR}
          />
        </div>
      )}
    </div>
  )
}
