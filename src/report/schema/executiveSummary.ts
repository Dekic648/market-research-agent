/**
 * buildExecutiveSummary — generates 2–4 editorial prose sentences from findings.
 *
 * Rules:
 *   1. HEADLINE: highest narrativeWeight finding (excluding distributions)
 *   2. FORMAT: column name + role + one concrete number from summaryLanguage
 *   3. SUPPORTING: next 2 by weight, convergence sentence if shared sourceColumn
 *   4. LENGTH GUARD: max 4 sentences total
 *
 * Reads from existing finding data — never re-runs analysis.
 */

import type { Finding } from '../../types/dataTypes'

/** Report priority tier labels */
const TIER_NAMES: Record<number, string> = {
  1: 'Frequencies and distributions',
  2: 'Segment breakdowns',
  3: 'Group differences',
  4: 'Relationships between variables',
  5: 'Scale structure and reliability',
  6: 'Drivers and predictions',
}

/** Report priority by step ID */
const REPORT_PRIORITY: Record<string, number> = {
  frequency: 1,
  crosstab: 2,
  segment_profile: 2,
  kw_significance: 3,
  posthoc: 3,
  correlation: 4,
  point_biserial: 4,
  cronbach: 5,
  efa: 5,
  regression: 6,
  driver_analysis: 6,
}

/** stepIds that are baseline context, not story-worthy as headlines */
const BASELINE_STEP_IDS = new Set(['frequency', 'descriptives', 'descriptives_summary'])

/** Role labels by stepId for headline sentence */
const ROLE_LABELS: Partial<Record<string, string>> = {
  regression: 'strongest predictor',
  driver_analysis: 'strongest predictor',
  logistic_regression: 'strongest predictor',
  correlation: 'most consistent relationship',
  point_biserial: 'most consistent relationship',
  kw_significance: 'clearest dividing line',
  anova_oneway: 'clearest dividing line',
  posthoc: 'clearest dividing line',
  crosstab: 'most notable segment difference',
  segment_profile: 'most notable segment difference',
}

/** Extract the first percentage or decimal number from a string */
function extractConcreteNumber(text: string | undefined): string | null {
  if (!text) return null
  // Match percentages like "84%", "34.5%"
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/)
  if (pctMatch) return `${pctMatch[1]}%`
  // Match decimals like "0.52", "3.2"
  const decMatch = text.match(/(\d+\.\d+)/)
  if (decMatch) return decMatch[1]
  // Match integers like "34" (but not single digits which are often noise)
  const intMatch = text.match(/\b(\d{2,})\b/)
  if (intMatch) return intMatch[1]
  return null
}

/**
 * Build 2–4 editorial prose sentences driven by narrativeWeight.
 * Returns an array of strings (sentences), not one-per-tier.
 */
export function buildExecutiveSummary(findings: Finding[]): string[] {
  const active = findings.filter((f) => !f.suppressed)
  if (active.length === 0) return []

  // Sort all findings by narrativeWeight DESC, falling back to |effectSize|
  const sorted = [...active].sort((a, b) => {
    const wA = a.narrativeWeight ?? Math.abs(a.effectSize ?? 0)
    const wB = b.narrativeWeight ?? Math.abs(b.effectSize ?? 0)
    return wB - wA
  })

  // RULE 1 — Find headline finding: highest weight, excluding baseline stepIds
  const headlineIdx = sorted.findIndex((f) => !BASELINE_STEP_IDS.has(f.stepId))
  // If everything is baseline, fall back to the first finding
  const headline = headlineIdx >= 0 ? sorted[headlineIdx] : sorted[0]

  const result: string[] = []
  const isBaselineHeadline = headlineIdx < 0

  // RULE 2 — Build headline sentence
  const headlineSentence = isBaselineHeadline
    ? (headline.summaryLanguage ?? headline.title).trimEnd().replace(/\.+$/, '') + '.'
    : buildHeadlineSentence(headline)
  result.push(headlineSentence)

  // RULE 3 — Supporting sentences: next 2 by weight, different from headline
  const candidates = sorted.filter((f) => f.id !== headline.id)
  // Prefer a different stepId if available
  const supporting: Finding[] = []
  const differentStepId = candidates.find((f) => f.stepId !== headline.stepId)
  const sameStepId = candidates.find((f) => f.stepId === headline.stepId)

  if (differentStepId) supporting.push(differentStepId)
  if (sameStepId && supporting.length < 2) supporting.push(sameStepId)
  // Fill remaining slots from other candidates
  for (const c of candidates) {
    if (supporting.length >= 2) break
    if (!supporting.includes(c)) supporting.push(c)
  }

  // Check for convergence: do both supporting findings share a sourceColumn with headline?
  const headlinePrimary = headline.sourceColumns?.[0]
  const convergenceColumns: string[] = []
  if (headlinePrimary) {
    for (const s of supporting) {
      if (s.sourceColumns?.[0] === headlinePrimary) {
        convergenceColumns.push(s.stepId)
      }
    }
  }

  if (convergenceColumns.length >= 2 && headlinePrimary) {
    // Both supporting share a sourceColumn → convergence sentence
    const totalAnalyses = convergenceColumns.length + 1 // +1 for headline
    result.push(`${headlinePrimary} appears as the central variable across ${totalAnalyses} analyses.`)
  } else {
    // Individual supporting sentences from summaryLanguage
    for (const s of supporting) {
      result.push(cleanSentence(s.summaryLanguage))
    }
  }

  // RULE 4 — Length guard: max 4 sentences
  while (result.length > 4) result.pop()

  return result
}

/** Build the headline sentence for the top finding */
function buildHeadlineSentence(finding: Finding): string {
  const role = ROLE_LABELS[finding.stepId] ?? 'most notable result'
  const concreteNumber = extractConcreteNumber(finding.summaryLanguage ?? finding.summary)

  // Try to extract a column/variable name
  const name = finding.sourceColumns?.[0]
    ?? extractColumnName(finding.title)
    ?? (finding.summaryLanguage ?? finding.title).split(/\s[—–-]\s/u)[0]?.trim()

  // Verification warning prefix
  const hasWarning = finding.verificationResults?.some((vr) => vr.severity === 'warning')
  const prefix = hasWarning ? 'Note: ' : ''

  // Warning detail
  const warningMsg = finding.verificationResults?.find((vr) => vr.severity === 'warning')?.message ?? 'results may vary across subgroups'
  const warningDetail = hasWarning
    ? ` However, ${warningMsg}.`
    : ''

  if (concreteNumber) {
    return `${prefix}${name} is the ${role} — ${concreteNumber}.${warningDetail}`
  }

  return `${prefix}${name} is the ${role}.${warningDetail}`
}

/** Extract column name from a finding title, removing common suffixes */
function extractColumnName(title: string): string | null {
  const distMatch = title.match(/^(.+?)\s+Distribution$/i)
  if (distMatch) return distMatch[1]
  const dashMatch = title.match(/^(.+?)\s*[—–-]\s*/u)
  if (dashMatch) return dashMatch[1]
  const segMatch = title.match(/^Segment\s+"(.+?)"/)
  if (segMatch) return segMatch[1]
  const crossMatch = title.match(/^(.+?\s*[×↔]\s*.+?):/u)
  if (crossMatch) return crossMatch[1]
  return null
}

/** Clean a sentence — capitalize, ensure period, truncate if needed */
function cleanSentence(text: string | undefined): string {
  if (!text) return ''
  let s = text.trim()
  if (s.length === 0) return ''
  s = s.charAt(0).toUpperCase() + s.slice(1)
  s = s.replace(/\s*\([^)]*[=<>][^)]*\)\s*$/, '')
  if (s.length > 197) s = s.slice(0, 197) + '...'
  if (!s.endsWith('.') && !s.endsWith('!') && !s.endsWith('?')) s += '.'
  return s
}

export { TIER_NAMES, REPORT_PRIORITY }
