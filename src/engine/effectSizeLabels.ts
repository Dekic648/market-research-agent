/**
 * Effect size magnitude labels — pure utility functions.
 * Used by plugin plainLanguage() methods to describe effect sizes
 * in natural language instead of raw numbers.
 */

/** Cohen's d (standardized mean difference) */
export function labelCohensD(d: number): 'negligible' | 'small' | 'moderate' | 'large' {
  const a = Math.abs(d)
  if (a < 0.2) return 'negligible'
  if (a < 0.5) return 'small'
  if (a < 0.8) return 'moderate'
  return 'large'
}

/** Pearson r / point-biserial r */
export function labelCorrelation(r: number): 'negligible' | 'weak' | 'moderate' | 'strong' {
  const a = Math.abs(r)
  if (a < 0.1) return 'negligible'
  if (a < 0.3) return 'weak'
  if (a < 0.5) return 'moderate'
  return 'strong'
}

/** R-squared (regression variance explained) */
export function labelRSquared(r2: number): 'weak' | 'moderate' | 'strong' {
  if (r2 < 0.13) return 'weak'
  if (r2 < 0.26) return 'moderate'
  return 'strong'
}

/**
 * Cramer's V (chi-square association).
 * Thresholds depend on degrees of freedom (Cohen 1988).
 * df = min(nRows - 1, nCols - 1) of the contingency table.
 */
export function labelCramersV(v: number, df: number): 'negligible' | 'small' | 'moderate' | 'large' {
  const a = Math.abs(v)
  if (df <= 1) {
    if (a < 0.1) return 'negligible'
    if (a < 0.3) return 'small'
    if (a < 0.5) return 'moderate'
    return 'large'
  }
  if (df === 2) {
    if (a < 0.07) return 'negligible'
    if (a < 0.21) return 'small'
    if (a < 0.35) return 'moderate'
    return 'large'
  }
  // df >= 3
  if (a < 0.06) return 'negligible'
  if (a < 0.17) return 'small'
  if (a < 0.29) return 'moderate'
  return 'large'
}

/** Epsilon-squared (Kruskal-Wallis effect size) */
export function labelEpsilonSquared(e2: number): 'negligible' | 'small' | 'moderate' | 'large' {
  if (e2 < 0.01) return 'negligible'
  if (e2 < 0.04) return 'small'
  if (e2 < 0.16) return 'moderate'
  return 'large'
}

/** Cronbach's alpha reliability level */
export function labelAlpha(a: number): 'excellent' | 'good' | 'acceptable' | 'questionable' | 'poor' | 'unacceptable' {
  if (a >= 0.9) return 'excellent'
  if (a >= 0.8) return 'good'
  if (a >= 0.7) return 'acceptable'
  if (a >= 0.6) return 'questionable'
  if (a >= 0.5) return 'poor'
  return 'unacceptable'
}

/** Format p-value for plain language */
export function formatP(p: number): string {
  if (p < 0.001) return '< .001'
  return `= ${p.toFixed(3)}`
}

/** Direction word for correlation/regression */
export function directionWord(value: number): 'positively' | 'negatively' {
  return value >= 0 ? 'positively' : 'negatively'
}
