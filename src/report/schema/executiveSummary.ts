/**
 * buildExecutiveSummary — generates one plain-language sentence per
 * report priority tier that has at least one finding.
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

/**
 * Build one summary sentence per tier that has findings.
 * Returns an array of strings, one per non-empty tier, in priority order.
 */
export function buildExecutiveSummary(findings: Finding[]): string[] {
  const active = findings.filter((f) => !f.suppressed)
  if (active.length === 0) return []

  // Group by tier
  const tiers = new Map<number, Finding[]>()
  for (const f of active) {
    const tier = REPORT_PRIORITY[f.stepId] ?? 99
    if (!tiers.has(tier)) tiers.set(tier, [])
    tiers.get(tier)!.push(f)
  }

  const result: string[] = []
  const sortedTiers = Array.from(tiers.keys()).sort((a, b) => a - b)

  for (const tier of sortedTiers) {
    const tierFindings = tiers.get(tier)!
    const sentence = buildTierSentence(tier, tierFindings)
    if (sentence) result.push(sentence)
  }

  return result
}

function buildTierSentence(tier: number, findings: Finding[]): string | null {
  if (findings.length === 0) return null

  switch (tier) {
    case 1: return buildTier1(findings)
    case 2: return buildTier2(findings)
    case 3: return buildTier3(findings)
    case 4: return buildTier4(findings)
    case 5: return buildTier5(findings)
    case 6: return buildTier6(findings)
    default: return null
  }
}

/** Tier 1: Frequencies — name top item(s) */
function buildTier1(findings: Finding[]): string {
  if (findings.length === 1) {
    return cleanSentence(findings[0].title)
  }
  // Extract column names from titles (they're formatted as "ColumnName Distribution")
  const names = findings
    .slice(0, 2)
    .map((f) => extractColumnName(f.title))
    .filter(Boolean)
  if (names.length >= 2) {
    return `${names[0]} and ${names[1]} are the most notable distribution patterns.`
  }
  return `${findings.length} distribution patterns analyzed across the dataset.`
}

/** Tier 2: Segments — most differentiating finding */
function buildTier2(findings: Finding[]): string {
  // Pick the finding with the strongest effect or most notable pattern
  const best = findings.reduce((a, b) => {
    const aE = Math.abs(a.effectSize ?? 0)
    const bE = Math.abs(b.effectSize ?? 0)
    return bE > aE ? b : a
  })
  const colName = extractColumnName(best.title)
  if (colName) {
    return `${colName} shows the most notable segment differences.`
  }
  return cleanSentence(best.title)
}

/** Tier 3: Group differences — count significant + name most important */
function buildTier3(findings: Finding[]): string {
  const sigFindings = findings.filter((f) => f.significant)
  if (sigFindings.length === 0) {
    return 'No significant group differences were found.'
  }
  // Sort by effect size descending to find most important
  const sorted = [...sigFindings].sort((a, b) => Math.abs(b.effectSize ?? 0) - Math.abs(a.effectSize ?? 0))
  const top = sorted[0]
  const colName = extractColumnName(top.title)
  if (sigFindings.length === 1) {
    return colName
      ? `${colName} shows a significant difference across groups.`
      : cleanSentence(top.title)
  }
  return colName
    ? `${sigFindings.length} significant group differences found. ${colName} shows the strongest effect.`
    : `${sigFindings.length} significant group differences found across the variables tested.`
}

/** Tier 4: Relationships — strongest correlation/association */
function buildTier4(findings: Finding[]): string {
  const sorted = [...findings].sort((a, b) => Math.abs(b.effectSize ?? 0) - Math.abs(a.effectSize ?? 0))
  const top = sorted[0]
  // Correlation titles are "ColA ↔ ColB: r = 0.xxx" or "ColA × ColB: r = 0.xxx"
  const pairMatch = top.title.match(/^(.+?)\s*[↔×]\s*(.+?):/u)
  if (pairMatch) {
    const strength = Math.abs(top.effectSize ?? 0) > 0.5 ? 'the strongest' : 'a notable'
    return `${pairMatch[1].trim()} and ${pairMatch[2].trim()} show ${strength} relationship.`
  }
  return cleanSentence(top.title)
}

/** Tier 5: Scale structure — reliability + factors */
function buildTier5(findings: Finding[]): string {
  const reliability = findings.find((f) => f.stepId === 'cronbach')
  const factor = findings.find((f) => f.stepId === 'efa')
  const parts: string[] = []

  if (reliability) {
    const level = reliability.effectLabel ?? 'measured'
    parts.push(`Scale reliability is ${level}`)
  }
  if (factor) {
    // Extract factor count from title like "2 factor(s) extracted..."
    const factorMatch = factor.title.match(/(\d+)\s*factor/)
    if (factorMatch) {
      parts.push(`${factorMatch[1]} underlying themes identified`)
    }
  }

  if (parts.length === 0) return cleanSentence(findings[0].title)
  return parts.join('. ') + '.'
}

/** Tier 6: Drivers/regression — top driver + R² */
function buildTier6(findings: Finding[]): string {
  // Prefer driver analysis over plain regression
  const driver = findings.find((f) => f.stepId === 'driver_analysis')
  const regression = findings.find((f) => f.stepId === 'regression')
  const target = driver ?? regression

  if (!target) return cleanSentence(findings[0].title)

  // Extract R² from the finding
  const r2 = target.effectSize
  const r2Str = r2 !== null ? `, explaining ${(r2 * 100).toFixed(0)}% of variance` : ''

  // Extract top predictor name from title
  // Driver: "Top driver: ColName (xx.x% relative importance)"
  // Regression: "R² = 0.xxx — N significant predictor(s)"
  const driverMatch = target.title.match(/Top driver:\s*(.+?)\s*\(/)
  const predMatch = target.title.match(/^(.+?)\s+is the strongest/)

  if (driverMatch) {
    return `${driverMatch[1]} is the strongest predictor${r2Str}.`
  }
  if (predMatch) {
    return `${predMatch[1]} is the strongest predictor${r2Str}.`
  }

  // Fallback: clean the title
  return cleanSentence(target.title) + (r2Str ? ` (${r2Str.slice(2)})` : '')
}

/** Extract column name from a finding title, removing common suffixes */
function extractColumnName(title: string): string | null {
  // "ColumnName Distribution" → "ColumnName"
  const distMatch = title.match(/^(.+?)\s+Distribution$/i)
  if (distMatch) return distMatch[1]

  // "ColumnName — significant difference..."  → "ColumnName"
  const dashMatch = title.match(/^(.+?)\s*[—–-]\s*/u)
  if (dashMatch) return dashMatch[1]

  // "Segment "X" (n=Y)" → "X"
  const segMatch = title.match(/^Segment\s+"(.+?)"/)
  if (segMatch) return segMatch[1]

  // "ColumnA × ColumnB" → "ColumnA × ColumnB"
  const crossMatch = title.match(/^(.+?\s*[×↔]\s*.+?):/u)
  if (crossMatch) return crossMatch[1]

  return null
}

/** Clean a sentence — capitalize, ensure period, truncate if needed */
function cleanSentence(text: string): string {
  let s = text.trim()
  if (s.length === 0) return ''
  // Capitalize first letter
  s = s.charAt(0).toUpperCase() + s.slice(1)
  // Remove trailing stat details in parentheses if they contain "=" or stat notation
  s = s.replace(/\s*\([^)]*[=<>][^)]*\)\s*$/, '')
  // Truncate at 200 chars
  if (s.length > 197) s = s.slice(0, 197) + '...'
  // Ensure ends with period
  if (!s.endsWith('.') && !s.endsWith('!') && !s.endsWith('?')) s += '.'
  return s
}

export { TIER_NAMES, REPORT_PRIORITY }
