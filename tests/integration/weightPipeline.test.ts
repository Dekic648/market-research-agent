/**
 * Integration test: weight pipeline end-to-end.
 * Verifies weights flow from extractWeights → HeadlessRunner → plugin.run().
 */
import { describe, it, expect } from 'vitest'
import { extractWeights } from '../../src/engine/weightExtractor'
import { FrequencyPlugin } from '../../src/plugins/FrequencyPlugin'
import type { ColumnDefinition } from '../../src/types/dataTypes'
import type { ResolvedColumnData } from '../../src/plugins/types'

describe('Weight pipeline integration', () => {
  it('extractWeights returns valid weights for a proper weight column', () => {
    const weightCol: ColumnDefinition = {
      id: 'w1',
      name: 'survey_weight',
      format: 'weight',
      statisticalType: 'continuous',
      role: 'weight',
      nRows: 5,
      nMissing: 0,
      nullMeaning: 'missing',
      rawValues: [1.2, 0.8, 1.5, 0.7, 1.0],
      fingerprint: null,
      semanticDetectionCache: null,
      transformStack: [],
      sensitivity: 'anonymous',
      declaredScaleRange: null,
    }

    const result = extractWeights(weightCol, 5, 'user', 'fp', 1, 'sess')
    expect(result.weights).toBeDefined()
    expect(result.weights).toHaveLength(5)
    expect(result.weightColumnName).toBe('survey_weight')
  })

  it('extractWeights returns undefined for null weight column', () => {
    const result = extractWeights(null, 5, 'user', 'fp', 1, 'sess')
    expect(result.weights).toBeUndefined()
  })

  it('FrequencyPlugin receives and uses weights when passed', async () => {
    const weights = [1, 1, 1, 1, 9] // heavy weight on value 5
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 4, 5] }],
      n: 5,
      weights,
    }

    const result = await FrequencyPlugin.run(data, weights)
    const freq = (result.data as any).frequencies[0]

    // Weighted mean should be pulled toward 5
    // Unweighted mean = 3.0, weighted = (1+2+3+4+45)/13 ≈ 4.23
    expect(freq.mean).toBeGreaterThan(3.5)

    // Detail should indicate weighted
    const detail = JSON.parse(result.findings[0].detail as string)
    expect(detail.weighted).toBe(true)
  })

  it('FrequencyPlugin works identically without weights', async () => {
    const data: ResolvedColumnData = {
      columns: [{ id: 'q1', name: 'Rating', values: [1, 2, 3, 4, 5] }],
      n: 5,
    }

    const result = await FrequencyPlugin.run(data)
    const freq = (result.data as any).frequencies[0]
    expect(freq.mean).toBeCloseTo(3.0, 1)

    const detail = JSON.parse(result.findings[0].detail as string)
    expect(detail.weighted).toBeFalsy()
  })
})
