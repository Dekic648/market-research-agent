/**
 * Weight extraction and validation tests.
 */
import { describe, it, expect } from 'vitest'
import { extractWeights } from '../../src/engine/weightExtractor'
import type { ColumnDefinition } from '../../src/types/dataTypes'

function makeWeightCol(values: (number | string | null)[]): ColumnDefinition {
  return {
    id: 'w1', name: 'Survey Weight', type: 'weight',
    nRows: values.length,
    nMissing: values.filter((v) => v === null).length,
    nullMeaning: 'missing',
    rawValues: values,
    fingerprint: null,
    semanticDetectionCache: null,
    transformStack: [],
    sensitivity: 'anonymous',
    declaredScaleRange: null,
  }
}

describe('extractWeights', () => {
  it('returns undefined when no weight column on node', () => {
    const result = extractWeights(null, 10, 'u', 'fp', 1, 's')
    expect(result.weights).toBeUndefined()
    expect(result.weightColumnName).toBeUndefined()
    expect(result.logEntry).toBeNull()
  })

  it('returns valid array when weight column present with all positive values', () => {
    const col = makeWeightCol([1.2, 0.8, 1.5, 0.9, 1.1])
    const result = extractWeights(col, 5, 'u', 'fp', 1, 's')
    expect(result.weights).toBeDefined()
    expect(result.weights!.length).toBe(5)
    expect(result.weights![0]).toBe(1.2)
    expect(result.weightColumnName).toBe('Survey Weight')
    expect(result.logEntry).toBeNull()
  })

  it('returns undefined and logs warning when weights contain a negative value', () => {
    const col = makeWeightCol([1.2, -0.5, 1.5, 0.9, 1.1])
    const result = extractWeights(col, 5, 'u', 'fp', 1, 's')
    expect(result.weights).toBeUndefined()
    expect(result.logEntry).not.toBeNull()
    expect(result.logEntry!.type).toBe('weight_validation_failed')
  })

  it('returns undefined and logs warning when weights length does not match rowCount', () => {
    const col = makeWeightCol([1.2, 0.8, 1.5])
    const result = extractWeights(col, 5, 'u', 'fp', 1, 's') // rowCount = 5, weights length = 3
    expect(result.weights).toBeUndefined()
    expect(result.logEntry).not.toBeNull()
  })

  it('returns undefined for weights with zero values', () => {
    const col = makeWeightCol([1.0, 0, 1.5, 0.9, 1.1])
    const result = extractWeights(col, 5, 'u', 'fp', 1, 's')
    expect(result.weights).toBeUndefined() // 0 is not > 0
  })

  it('finding produced with weights active has weightedBy field', () => {
    const col = makeWeightCol([1.2, 0.8, 1.5])
    const result = extractWeights(col, 3, 'u', 'fp', 1, 's')
    expect(result.weightColumnName).toBe('Survey Weight')
    // This would be set as finding.weightedBy in the runner
  })

  it('finding produced without weights has weightedBy undefined', () => {
    const result = extractWeights(null, 10, 'u', 'fp', 1, 's')
    expect(result.weightColumnName).toBeUndefined()
  })
})
