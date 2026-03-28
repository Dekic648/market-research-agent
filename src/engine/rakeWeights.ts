/**
 * Rake weighting — computes respondent weights from population proportions.
 * Pure function. Used by WeightCalculator UI component.
 */

export interface RakeWeightResult {
  weights: number[]
  min: number
  max: number
  mean: number
  error?: string
}

/**
 * Compute rake weights from sample category values and population proportions.
 *
 * For each row: weight = popProportion[group] / sampleProportion[group]
 * Then normalize so weights average to 1.0.
 *
 * @param categoryValues — resolved category values, one per row
 * @param populationProportions — { groupLabel: proportion (0-1) }
 */
export function computeRakeWeights(
  categoryValues: (number | string | null)[],
  populationProportions: Record<string, number>
): RakeWeightResult {
  // Count sample proportions per group
  const sampleCounts = new Map<string, number>()
  let totalValid = 0
  for (const v of categoryValues) {
    if (v === null || v === undefined) continue
    const key = String(v)
    sampleCounts.set(key, (sampleCounts.get(key) ?? 0) + 1)
    totalValid++
  }

  if (totalValid === 0) {
    return { weights: categoryValues.map(() => 1), min: 1, max: 1, mean: 1, error: 'No valid category values' }
  }

  // Check for groups with 0 sample representation
  for (const [group, popProp] of Object.entries(populationProportions)) {
    if (popProp > 0 && (!sampleCounts.has(group) || sampleCounts.get(group) === 0)) {
      return { weights: categoryValues.map(() => 1), min: 1, max: 1, mean: 1, error: `Group "${group}" has population proportion ${popProp} but no sample representation` }
    }
  }

  // Compute raw weights per row
  const rawWeights: number[] = []
  for (const v of categoryValues) {
    if (v === null || v === undefined) {
      rawWeights.push(1)
      continue
    }
    const key = String(v)
    const sampleProp = (sampleCounts.get(key) ?? 0) / totalValid
    const popProp = populationProportions[key] ?? sampleProp // default to sample prop if not specified
    rawWeights.push(sampleProp > 0 ? popProp / sampleProp : 1)
  }

  // Normalize so mean = 1.0
  const rawMean = rawWeights.reduce((s, w) => s + w, 0) / rawWeights.length
  const weights = rawMean > 0 ? rawWeights.map((w) => w / rawMean) : rawWeights

  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const mean = weights.reduce((s, w) => s + w, 0) / weights.length

  return { weights, min, max, mean }
}
