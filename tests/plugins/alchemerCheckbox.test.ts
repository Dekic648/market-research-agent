/**
 * Tests for Alchemer checkbox grid detection and handling:
 *   - isAlchemerCheckboxColumn detection
 *   - isAlchemerCheckboxGrid multi-column detection
 *   - resolveColumn normalization (code → 1, null → 0)
 *   - nullMeaning assignment
 *   - CapabilityMatcher emission
 *   - TaskProposer guards
 */

import { describe, it, expect } from 'vitest'
import { isAlchemerCheckboxColumn, isAlchemerCheckboxGrid, inferColumnType } from '../../src/components/DataInput/inferColumnType'
import { resolveColumn } from '../../src/engine/resolveColumn'
import { CapabilityMatcher } from '../../src/engine/CapabilityMatcher'
import type { ColumnDefinition, ColumnFingerprint } from '../../src/types/dataTypes'

// Register plugins for TaskProposer
import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/CrosstabPlugin'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/RegressionPlugin'
import '../../src/plugins/DriverPlugin'

function makeFp(overrides: Partial<ColumnFingerprint> = {}): ColumnFingerprint {
  return {
    columnId: 'test',
    hash: 'test',
    nRows: 100,
    nUnique: 1,
    nMissing: 60,
    numericRatio: 1.0,
    min: 3,
    max: 3,
    mean: 3,
    sd: 0,
    topValues: [{ value: 3, count: 40 }],
    computedAt: Date.now(),
    ...overrides,
  }
}

// ============================================================
// Alchemer checkbox column detection
// ============================================================

describe('isAlchemerCheckboxColumn', () => {
  it('detects Alchemer pattern: single code value + high null ratio', () => {
    // Q12_3: all non-null values are 3, ~60% null
    const values: (number | null)[] = Array.from({ length: 100 }, (_, i) => i < 60 ? null : 3)
    const fp = makeFp({ nUnique: 1, nMissing: 60, numericRatio: 1.0, min: 3, max: 3 })
    expect(isAlchemerCheckboxColumn(values, fp, 'Q12_3')).toBe(true)
  })

  it('rejects columns with low null ratio (< 10%)', () => {
    const values: (number | null)[] = Array.from({ length: 100 }, (_, i) => i < 5 ? null : 1)
    const fp = makeFp({ nMissing: 5 })
    expect(isAlchemerCheckboxColumn(values, fp, 'Q12_1')).toBe(false)
  })

  it('rejects columns with non-integer values', () => {
    const values: (number | null)[] = Array.from({ length: 100 }, (_, i) => i < 60 ? null : 3.5)
    const fp = makeFp({ nMissing: 60 })
    expect(isAlchemerCheckboxColumn(values, fp, 'Q12_1')).toBe(false)
  })

  it('rejects columns with many different non-null values', () => {
    const values: (number | null)[] = Array.from({ length: 100 }, (_, i) => i < 60 ? null : i)
    const fp = makeFp({ nUnique: 40, nMissing: 60 })
    expect(isAlchemerCheckboxColumn(values, fp, 'Q12_1')).toBe(false)
  })
})

// ============================================================
// Alchemer checkbox grid detection
// ============================================================

describe('isAlchemerCheckboxGrid', () => {
  it('detects 3+ columns with shared prefix as checkbox grid', () => {
    const makeCol = (name: string, code: number) => ({
      name,
      values: Array.from({ length: 100 }, (_, i) => i < 60 ? null : code) as (number | null)[],
      fingerprint: makeFp({ nUnique: 1, nMissing: 60, min: code, max: code }),
    })
    const columns = [
      makeCol('Q12_1', 1),
      makeCol('Q12_3', 3),
      makeCol('Q12_5', 5),
    ]
    expect(isAlchemerCheckboxGrid(columns)).toBe(true)
  })

  it('rejects fewer than 3 columns', () => {
    const makeCol = (name: string, code: number) => ({
      name,
      values: Array.from({ length: 100 }, (_, i) => i < 60 ? null : code) as (number | null)[],
      fingerprint: makeFp({ nUnique: 1, nMissing: 60, min: code, max: code }),
    })
    expect(isAlchemerCheckboxGrid([makeCol('Q12_1', 1), makeCol('Q12_3', 3)])).toBe(false)
  })
})

// ============================================================
// inferColumnType for Alchemer data
// ============================================================

describe('inferColumnType — Alchemer', () => {
  it('returns multi_response for Alchemer checkbox column', () => {
    const values: (number | null)[] = Array.from({ length: 100 }, (_, i) => i < 60 ? null : 5)
    const fp = makeFp({ nUnique: 1, nMissing: 60, min: 5, max: 5, numericRatio: 1.0 })
    expect(inferColumnType(values, fp, 'Q12_5')).toBe('multi_response')
  })
})

// ============================================================
// resolveColumn normalization
// ============================================================

describe('resolveColumn — multi_response normalization', () => {
  it('converts Alchemer code values to 1 and nulls to 0', () => {
    const col: ColumnDefinition = {
      id: 'q12_3',
      name: 'Q12_3',
      format: 'multi_response',
      type: 'multi_response',
      statisticalType: 'multi_response',
      role: 'analyze',
      nRows: 6,
      nMissing: 3,
      nullMeaning: 'not_chosen',
      rawValues: [3, null, 3, null, 3, null],
      fingerprint: null,
      semanticDetectionCache: null,
      transformStack: [],
      sensitivity: 'anonymous',
      declaredScaleRange: null,
    }
    const resolved = resolveColumn(col)
    expect(resolved).toEqual(['Selected', 'Not selected', 'Selected', 'Not selected', 'Selected', 'Not selected'])
  })

  it('handles mixed code values (all become 1)', () => {
    const col: ColumnDefinition = {
      id: 'q12_mix',
      name: 'Q12_mix',
      format: 'multi_response',
      type: 'multi_response',
      statisticalType: 'multi_response',
      role: 'analyze',
      nRows: 4,
      nMissing: 1,
      nullMeaning: 'not_chosen',
      rawValues: [5, null, 7, 3],
      fingerprint: null,
      semanticDetectionCache: null,
      transformStack: [],
      sensitivity: 'anonymous',
      declaredScaleRange: null,
    }
    const resolved = resolveColumn(col)
    expect(resolved).toEqual(['Selected', 'Not selected', 'Selected', 'Selected'])
  })
})

// ============================================================
// CapabilityMatcher
// ============================================================

describe('CapabilityMatcher — multi_response', () => {
  it('emits multiple_response capability for multi_response columns', () => {
    const caps = CapabilityMatcher.resolveFromColumns([{
      id: 'q12_1',
      name: 'Q12_1',
      format: 'multi_response',
      type: 'multi_response',
      statisticalType: 'multi_response',
      role: 'analyze' as const,
      nRows: 100,
      nMissing: 60,
      nullMeaning: 'not_chosen',
      rawValues: Array.from({ length: 100 }, (_, i) => i < 60 ? null : 1),
      fingerprint: null,
      semanticDetectionCache: null,
      transformStack: [],
      sensitivity: 'anonymous',
      declaredScaleRange: null,
    }])
    expect(caps.has('multiple_response')).toBe(true)
    expect(caps.has('categorical')).toBe(true)
  })
})

// ============================================================
// TaskProposer guards
// ============================================================

describe('TaskProposer — multi_response guards', () => {
  it('proposes frequency but not regression for multi_response blocks', async () => {
    const { proposeTasks } = await import('../../src/engine/TaskProposer')
    const blocks = [{
      id: 'q12', label: 'Game Modes', format: 'multi_response' as const, questionType: 'multi_response' as const,
      columns: Array.from({ length: 5 }, (_, i) => ({
        id: `q12_${i + 1}`,
        name: `Q12_${i + 1}`,
        format: 'multi_response' as const,
        type: 'multi_response' as const,
        statisticalType: 'multi_response' as const,
        role: 'analyze' as const,
        nRows: 100,
        nMissing: 60,
        nullMeaning: 'not_chosen' as const,
        rawValues: Array.from({ length: 100 }, (_, j) => j < 60 ? null : i + 1),
        fingerprint: null,
        semanticDetectionCache: null,
        transformStack: [],
        sensitivity: 'anonymous' as const,
        declaredScaleRange: null,
      })),
      role: 'analyze' as const,
      confirmed: true,
      pastedAt: Date.now(),
    }]
    const tasks = proposeTasks(blocks)
    const pluginIds = tasks.map((t) => t.pluginId)
    expect(pluginIds).toContain('frequency')
    expect(pluginIds).not.toContain('regression')
    expect(pluginIds).not.toContain('correlation')
    expect(pluginIds).not.toContain('cronbach')
    expect(pluginIds).not.toContain('kw_significance')
  })
})
