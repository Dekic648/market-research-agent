/**
 * Compute variable — formula evaluation for derived columns.
 *
 * Formulas are stored as strings in ComputeVariableTransform.
 * Re-executed from source on every resolveColumn() call — never stores result.
 *
 * Supported operations: MEAN, SUM, MIN, MAX
 */

export type ComputeOp = 'mean' | 'sum' | 'min' | 'max'

/**
 * Compute a derived variable from multiple source columns.
 * Returns a new values array — one value per row.
 */
export function computeVariable(
  sourceColumns: Array<{ values: (number | string | null)[] }>,
  operation: ComputeOp
): (number | null)[] {
  if (sourceColumns.length === 0) return []
  const n = sourceColumns[0].values.length

  const result: (number | null)[] = []

  for (let i = 0; i < n; i++) {
    const nums: number[] = []
    for (const col of sourceColumns) {
      const v = col.values[i]
      if (v === null) continue
      const num = typeof v === 'number' ? v : parseFloat(String(v))
      if (!isNaN(num)) nums.push(num)
    }

    if (nums.length === 0) {
      result.push(null)
      continue
    }

    switch (operation) {
      case 'mean':
        result.push(nums.reduce((s, n) => s + n, 0) / nums.length)
        break
      case 'sum':
        result.push(nums.reduce((s, n) => s + n, 0))
        break
      case 'min':
        result.push(Math.min(...nums))
        break
      case 'max':
        result.push(Math.max(...nums))
        break
    }
  }

  return result
}

/**
 * Parse a simple formula string into operation + column references.
 *
 * Supported formats:
 *   "MEAN(Q1, Q2, Q3)"
 *   "SUM(Q1, Q2_r, Q3)"
 *   "MIN(Score1, Score2)"
 *   "MAX(Score1, Score2)"
 */
export function parseFormula(
  formula: string
): { operation: ComputeOp; columnNames: string[] } | null {
  const match = formula
    .trim()
    .match(/^(MEAN|SUM|MIN|MAX)\s*\(\s*(.+)\s*\)$/i)

  if (!match) return null

  const operation = match[1].toLowerCase() as ComputeOp
  const columnNames = match[2]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (columnNames.length === 0) return null

  return { operation, columnNames }
}
