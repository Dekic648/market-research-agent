/**
 * Semantic detection checks — Claude API for question-wording analysis.
 *
 * Rules:
 * - Check column.sensitivity === 'anonymous' before ANY API call
 * - Hard block on 'pseudonymous' and 'personal' — never send to external API
 * - Cache result in ColumnDefinition.semanticDetectionCache — never call twice
 * - Called once per scale group at tagging time, not per analysis
 */

import type { DetectionFlag } from './types'

// ============================================================
// Types
// ============================================================

export interface SemanticCheckInput {
  columnId: string
  columnName: string
  sensitivity: 'anonymous' | 'pseudonymous' | 'personal'
  /** Cached result — if present, skip API call */
  cachedResult: SemanticResult | null
  /** Sample values for context (first 5 non-null) */
  sampleValues: (number | string)[]
  /** Scale group label if available */
  scaleGroupLabel?: string
  /** Peer column names in the same scale group */
  peerColumnNames?: string[]
}

export interface SemanticResult {
  isReverseCoded: boolean
  confidence: number
  reasoning: string
  questionIntent: string      // what the question is asking about
  scaleDirection: 'positive' | 'negative' | 'neutral' | 'unclear'
  cachedAt: number
}

/** Configuration for the Claude API client */
export interface SemanticCheckConfig {
  /** Function that calls the Claude API. Injected to keep detection decoupled. */
  callApi: (prompt: string) => Promise<string>
  /** Whether semantic checks are enabled (can be toggled off) */
  enabled: boolean
}

// Module-level config — set via configureSemanticChecks()
let config: SemanticCheckConfig | null = null

// ============================================================
// Configuration
// ============================================================

/**
 * Configure the semantic checks module with an API caller.
 * Must be called before runSemanticCheck() will do anything.
 */
export function configureSemanticChecks(cfg: SemanticCheckConfig): void {
  config = cfg
}

// ============================================================
// Main check
// ============================================================

/**
 * Run semantic analysis on a column using Claude API.
 *
 * Returns null if:
 * - Semantic checks are not configured or disabled
 * - Column sensitivity is not 'anonymous'
 * - Result is already cached
 * - API call fails (logs error, returns null — never blocks analysis)
 */
export async function runSemanticCheck(
  input: SemanticCheckInput
): Promise<{ flag: DetectionFlag | null; result: SemanticResult } | null> {
  // Gate 1: config must exist and be enabled
  if (!config || !config.enabled) return null

  // Gate 2: GDPR — never send non-anonymous data to external API
  if (input.sensitivity !== 'anonymous') return null

  // Gate 3: cached result — don't call twice
  if (input.cachedResult) {
    return {
      flag: cachedResultToFlag(input.columnId, input.cachedResult),
      result: input.cachedResult,
    }
  }

  // Build the prompt
  const prompt = buildPrompt(input)

  try {
    const response = await config.callApi(prompt)
    const result = parseResponse(response)

    const flag = result.isReverseCoded
      ? {
          id: `sem_rev_${input.columnId}_${Date.now()}`,
          type: 'reverse_coded' as const,
          columnId: input.columnId,
          severity: 'warning' as const,
          source: 'semantic' as const,
          confidence: result.confidence,
          message: `Claude API analysis suggests this item is reverse-worded: "${result.reasoning}"`,
          suggestion: 'Apply reverseCode transform. Cross-reference with the statistical reverse-coding check.',
          detail: {
            questionIntent: result.questionIntent,
            scaleDirection: result.scaleDirection,
            reasoning: result.reasoning,
          },
          timestamp: Date.now(),
        }
      : null

    return { flag, result }
  } catch {
    // API failure is never fatal — detection is passive
    return null
  }
}

// ============================================================
// Batch check — one call per scale group
// ============================================================

/**
 * Run semantic checks on an entire scale group at once.
 * More efficient than per-column calls — one API call for the whole group.
 */
export async function runSemanticCheckBatch(
  inputs: SemanticCheckInput[]
): Promise<Map<string, { flag: DetectionFlag | null; result: SemanticResult }>> {
  const results = new Map<string, { flag: DetectionFlag | null; result: SemanticResult }>()

  // Process each input — cached results are returned immediately
  const uncached: SemanticCheckInput[] = []

  for (const input of inputs) {
    if (input.sensitivity !== 'anonymous') continue
    if (input.cachedResult) {
      results.set(input.columnId, {
        flag: cachedResultToFlag(input.columnId, input.cachedResult),
        result: input.cachedResult,
      })
    } else {
      uncached.push(input)
    }
  }

  if (uncached.length === 0 || !config || !config.enabled) return results

  // Build batch prompt
  const prompt = buildBatchPrompt(uncached)

  try {
    const response = await config.callApi(prompt)
    const parsed = parseBatchResponse(response, uncached)

    for (const [columnId, result] of parsed) {
      const flag = result.isReverseCoded
        ? {
            id: `sem_rev_${columnId}_${Date.now()}`,
            type: 'reverse_coded' as const,
            columnId,
            severity: 'warning' as const,
            source: 'semantic' as const,
            confidence: result.confidence,
            message: `Semantic analysis: "${result.reasoning}"`,
            suggestion: 'Apply reverseCode transform.',
            detail: {
              questionIntent: result.questionIntent,
              scaleDirection: result.scaleDirection,
              reasoning: result.reasoning,
            },
            timestamp: Date.now(),
          }
        : null

      results.set(columnId, { flag, result })
    }
  } catch {
    // Batch failure — return whatever we have from cache
  }

  return results
}

// ============================================================
// Prompt building
// ============================================================

function buildPrompt(input: SemanticCheckInput): string {
  const peerContext = input.peerColumnNames?.length
    ? `\nOther items in this scale group: ${input.peerColumnNames.join(', ')}`
    : ''

  return `You are analyzing survey question wording for a market research statistics tool.

Column name: "${input.columnName}"
Scale group: ${input.scaleGroupLabel ?? 'unknown'}
Sample values: ${input.sampleValues.slice(0, 5).join(', ')}${peerContext}

Is this item reverse-worded (i.e., higher values indicate the OPPOSITE direction from what the other items in the scale measure)?

Respond in this exact JSON format:
{
  "isReverseCoded": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "questionIntent": "what the question measures",
  "scaleDirection": "positive" | "negative" | "neutral" | "unclear"
}`
}

function buildBatchPrompt(inputs: SemanticCheckInput[]): string {
  const items = inputs.map((inp, i) =>
    `${i + 1}. Column "${inp.columnName}" — samples: ${inp.sampleValues.slice(0, 3).join(', ')}`
  ).join('\n')

  const groupLabel = inputs[0]?.scaleGroupLabel ?? 'unknown'

  return `You are analyzing survey question wording for a market research statistics tool.

Scale group: ${groupLabel}
Items:
${items}

For EACH item, determine if it is reverse-worded (higher values = opposite direction from peers).

Respond with a JSON array, one object per item in the same order:
[
  {
    "columnName": "...",
    "isReverseCoded": true/false,
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation",
    "questionIntent": "what it measures",
    "scaleDirection": "positive" | "negative" | "neutral" | "unclear"
  }
]`
}

// ============================================================
// Response parsing
// ============================================================

function parseResponse(raw: string): SemanticResult {
  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return defaultResult()

    const parsed = JSON.parse(jsonMatch[0])
    return {
      isReverseCoded: Boolean(parsed.isReverseCoded),
      confidence: clamp(Number(parsed.confidence) || 0.5, 0, 1),
      reasoning: String(parsed.reasoning ?? ''),
      questionIntent: String(parsed.questionIntent ?? ''),
      scaleDirection: validateDirection(parsed.scaleDirection),
      cachedAt: Date.now(),
    }
  } catch {
    return defaultResult()
  }
}

function parseBatchResponse(
  raw: string,
  inputs: SemanticCheckInput[]
): Map<string, SemanticResult> {
  const results = new Map<string, SemanticResult>()

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return results

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return results

    for (let i = 0; i < Math.min(parsed.length, inputs.length); i++) {
      const item = parsed[i]
      results.set(inputs[i].columnId, {
        isReverseCoded: Boolean(item.isReverseCoded),
        confidence: clamp(Number(item.confidence) || 0.5, 0, 1),
        reasoning: String(item.reasoning ?? ''),
        questionIntent: String(item.questionIntent ?? ''),
        scaleDirection: validateDirection(item.scaleDirection),
        cachedAt: Date.now(),
      })
    }
  } catch {
    // Parse failure — return empty map
  }

  return results
}

// ============================================================
// Helpers
// ============================================================

function cachedResultToFlag(columnId: string, result: SemanticResult): DetectionFlag | null {
  if (!result.isReverseCoded) return null
  return {
    id: `sem_rev_${columnId}_cached`,
    type: 'reverse_coded',
    columnId,
    severity: 'warning',
    source: 'semantic',
    confidence: result.confidence,
    message: `Cached semantic analysis: "${result.reasoning}"`,
    suggestion: 'Apply reverseCode transform.',
    detail: {
      questionIntent: result.questionIntent,
      scaleDirection: result.scaleDirection,
      reasoning: result.reasoning,
      fromCache: true,
    },
    timestamp: result.cachedAt,
  }
}

function defaultResult(): SemanticResult {
  return {
    isReverseCoded: false,
    confidence: 0,
    reasoning: 'Unable to parse API response',
    questionIntent: '',
    scaleDirection: 'unclear',
    cachedAt: Date.now(),
  }
}

function validateDirection(d: unknown): 'positive' | 'negative' | 'neutral' | 'unclear' {
  if (d === 'positive' || d === 'negative' || d === 'neutral') return d
  return 'unclear'
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
