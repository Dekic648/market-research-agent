/**
 * PasteGridAdapter — parses raw pasted text (TSV/CSV from clipboard) into
 * structured column arrays.
 *
 * Faithfully extracted from analyze.html parsing logic:
 *  - parseValues()        — single-column numeric parsing
 *  - alignColumns()       — multi-column row-aligned parsing
 *  - parseMultiCols()     — tab-separated block parsing with header detection
 *  - parseMultiResponse() — multi-column split by tabs
 *
 * Key invariants (from project feedback):
 *  - NEVER remove rows — empty cells stay as null
 *  - Empty cell = "not selected" — they are DATA
 *  - Numeric-looking strings → numbers
 *  - First row = headers when detected as non-numeric text
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedColumn {
  id: string
  name: string
  values: (number | string | null)[]
}

export interface PastedData {
  columns: ParsedColumn[]
  rawText: string
  format: 'tsv' | 'csv' | 'unknown'
  nRows: number
  nCols: number
}

// ---------------------------------------------------------------------------
// Internal helpers (ported from analyze.html)
// ---------------------------------------------------------------------------

const EXCEL_ERRORS: Record<string, true> = {
  '#N/A': true, '#REF!': true, '#VALUE!': true, '#DIV/0!': true,
  '#NULL!': true, '#NAME?': true, '#NUM!': true, '#N/A!': true, '#REF': true,
}

function isExcelError(v: string): boolean {
  return EXCEL_ERRORS.hasOwnProperty(v.trim().toUpperCase())
}

/**
 * Detect the delimiter used in pasted text.
 * Tabs win if multiple lines contain tabs (spreadsheet paste).
 * Otherwise fall back to comma detection, then 'unknown' (single-column).
 */
function detectFormat(lines: string[]): 'tsv' | 'csv' | 'unknown' {
  const tabLines = lines.filter(l => l.includes('\t'))
  if (tabLines.length >= 2) return 'tsv'

  // CSV heuristic: majority of non-empty lines contain commas,
  // and the comma count is consistent (same number of fields).
  const nonEmpty = lines.filter(l => l.trim() !== '')
  const commaLines = nonEmpty.filter(l => l.includes(','))
  if (commaLines.length >= 2 && commaLines.length >= nonEmpty.length * 0.5) {
    // Check field-count consistency across first few rows
    const counts = commaLines.slice(0, 5).map(l => l.split(',').length)
    const allSame = counts.every(c => c === counts[0])
    if (allSame && counts[0] > 1) return 'csv'
  }

  return 'unknown'
}

/**
 * Try to convert a string to a number.
 * Returns the number if it looks numeric, otherwise returns the original string.
 * Empty / whitespace-only strings and Excel errors → null.
 */
function coerceCell(raw: string): number | string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (isExcelError(trimmed)) return null

  // Strip trailing % (e.g. "49%" → 49)
  let cleaned = trimmed
  if (/^-?\d+(\.\d+)?%$/.test(cleaned)) {
    cleaned = cleaned.replace('%', '')
  }

  const n = parseFloat(cleaned)
  if (!isNaN(n) && isFinite(n) && String(n) !== 'NaN') {
    // Make sure the entire token was numeric (avoid "12abc" → 12)
    // parseFloat is lenient, so verify with a stricter regex
    if (/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return n
  }

  return trimmed
}

/**
 * Detect whether the first row is a header row.
 *
 * Ported from analyze.html: the first row is treated as headers when
 * ALL cells in the first row are non-empty, non-numeric text AND at least
 * the second row contains some numeric or empty cells.
 */
function detectHeaderRow(rows: string[][]): boolean {
  if (rows.length < 2) return false

  const firstRow = rows[0]

  // All cells in first row must be non-empty, non-numeric text
  const firstRowAllText = firstRow.every(cell => {
    const t = cell.trim()
    if (t === '') return false
    const n = parseFloat(t)
    return isNaN(n) || !isFinite(n)
  })

  if (!firstRowAllText) return false

  // Second row should have at least some numeric or empty cells
  const secondRow = rows[1]
  const hasNumericOrEmpty = secondRow.some(cell => {
    const t = cell.trim()
    if (t === '') return true
    const n = parseFloat(t)
    return !isNaN(n) && isFinite(n)
  })

  return hasNumericOrEmpty
}

/**
 * Split raw text into a 2-D grid of strings using the given delimiter.
 */
function splitGrid(text: string, delimiter: string): string[][] {
  const lines = text.split(/\r?\n/)

  // Strip trailing blank lines only (from trailing newlines in paste)
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }

  return lines.map(line => line.split(delimiter))
}

/**
 * Normalise column count: pad short rows with empty strings so every row
 * has the same number of columns.
 */
function normaliseGrid(grid: string[][]): string[][] {
  const maxCols = grid.reduce((max, row) => Math.max(max, row.length), 0)
  return grid.map(row => {
    while (row.length < maxCols) row.push('')
    return row
  })
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const PasteGridAdapter = {
  /**
   * Can we handle this input?
   * We accept any non-empty string — this is the catch-all paste adapter.
   */
  canHandle(raw: string): boolean {
    return typeof raw === 'string' && raw.trim().length > 0
  },

  /**
   * Parse raw pasted text into structured PastedData.
   *
   * Logic mirrors analyze.html:
   *  1. Detect format (TSV / CSV / single-column)
   *  2. Split into grid
   *  3. Detect & extract header row
   *  4. Coerce cells (numbers, nulls)
   *  5. Build ParsedColumn[] — NEVER drop rows
   */
  parse(raw: string): PastedData {
    const lines = raw.split(/\r?\n/)
    const format = detectFormat(lines)

    const delimiter = format === 'tsv' ? '\t' : format === 'csv' ? ',' : '\t'

    let grid = splitGrid(raw, delimiter)

    // For 'unknown' format (no tabs, no consistent commas) treat each line
    // as a single-column entry.
    if (format === 'unknown') {
      grid = splitGrid(raw, '\n').map(row => [row.join('')])
    }

    grid = normaliseGrid(grid)

    // Header detection
    const hasHeader = detectHeaderRow(grid)
    const headerRow = hasHeader ? grid[0] : null
    const dataRows = hasHeader ? grid.slice(1) : grid

    // Determine column count
    const nCols = dataRows.length > 0 ? dataRows[0].length : (headerRow ? headerRow.length : 0)

    // Build columns — transpose row-major data to column-major
    const columns: ParsedColumn[] = []
    for (let c = 0; c < nCols; c++) {
      const name = headerRow
        ? headerRow[c].trim() || `Column ${c + 1}`
        : `Column ${c + 1}`

      const values: (number | string | null)[] = []
      for (let r = 0; r < dataRows.length; r++) {
        const cellRaw = c < dataRows[r].length ? dataRows[r][c] : ''
        values.push(coerceCell(cellRaw))
      }

      columns.push({
        id: `col_${c}`,
        name,
        values,
      })
    }

    return {
      columns,
      rawText: raw,
      format,
      nRows: dataRows.length,
      nCols,
    }
  },
}
