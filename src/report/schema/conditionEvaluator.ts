/**
 * Condition evaluator — resolves `showIf` expressions in ConditionalSections.
 *
 * Rule: no renderer contains business logic. All conditional display
 * is evaluated here BEFORE the renderer receives the section.
 *
 * Supported expressions:
 *   "R2 > 0.3"
 *   "alpha > 0.7"
 *   "p < 0.05"
 *   "n > 100"
 *   "true" / "false"
 */

export interface EvalContext {
  /** Values from analysis results keyed by name */
  values: Record<string, number | string | boolean>
}

/**
 * Evaluate a simple condition expression.
 * Returns true if the condition is met, false otherwise.
 * Returns true for malformed expressions (fail-open: show the section).
 */
export function evaluateCondition(expr: string, context: EvalContext): boolean {
  const trimmed = expr.trim()

  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === '') return true

  // Parse: "variable operator value"
  const match = trimmed.match(/^(\w+)\s*(>=|<=|!=|==|>|<)\s*(.+)$/)
  if (!match) return true // fail-open

  const [, varName, operator, rawValue] = match
  const contextValue = context.values[varName]

  if (contextValue === undefined) return true // variable not found — show section

  const numContext = typeof contextValue === 'number' ? contextValue : parseFloat(String(contextValue))
  const numTarget = parseFloat(rawValue.trim())

  if (isNaN(numContext) || isNaN(numTarget)) {
    // String comparison
    const strContext = String(contextValue)
    const strTarget = rawValue.trim()
    switch (operator) {
      case '==': return strContext === strTarget
      case '!=': return strContext !== strTarget
      default: return true
    }
  }

  switch (operator) {
    case '>': return numContext > numTarget
    case '<': return numContext < numTarget
    case '>=': return numContext >= numTarget
    case '<=': return numContext <= numTarget
    case '==': return numContext === numTarget
    case '!=': return numContext !== numTarget
    default: return true
  }
}

/**
 * Resolve all conditional sections in a schema — returns only sections
 * whose conditions are met. Recursive for nested conditionals.
 */
export function resolveConditionalSections<T extends { type: string }>(
  sections: T[],
  context: EvalContext
): T[] {
  const resolved: T[] = []

  for (const section of sections) {
    if ((section as any).type === 'conditional') {
      const cond = section as any
      if (evaluateCondition(cond.showIf, context)) {
        resolved.push(cond.section)
      }
    } else {
      resolved.push(section)
    }
  }

  return resolved
}
