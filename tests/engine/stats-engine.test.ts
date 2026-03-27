/**
 * Stats Engine tests — migrated from v1 test-suite.js
 * All expected values verified against textbook formulas / scipy reference.
 * These are ground truth — do not change the expected values.
 */
import { describe, it, expect } from 'vitest'
import {
  _helpers,
  ttest, pairedTTest, anova, welchAnova,
  mannWhitney, wilcoxon, kruskalWallis, friedman,
  repeatedMeasuresAnova, twoWayAnova,
  pearson, spearman, kendallTau, pointBiserial,
  chiSquare, fisherExact,
  linearRegression, logisticRegression,
  cronbachAlpha, pca, factorAnalysis,
  kMeans,
  shapiroWilk, levene,
  hierarchicalClustering,
  latentClassAnalysis,
  diffInDiff,
} from '../../src/engine/stats-engine'

// ============================================================
// REFERENCE DATASETS — same as v1 test-suite.js
// ============================================================

// Dataset A: Two groups for t-test, Mann-Whitney
const groupA = [4, 5, 6, 5, 4, 3, 5, 6, 4, 5, 7, 3, 4, 5, 6]
const groupB = [6, 7, 8, 7, 6, 5, 7, 8, 6, 7, 9, 5, 6, 7, 8]

// Dataset B: Paired data
const before = [45, 52, 48, 55, 43, 50, 47, 53, 46, 51]
const after = [50, 55, 52, 58, 48, 54, 51, 57, 50, 55]

// Dataset C: Three groups for ANOVA
const g1 = [3, 4, 5, 4, 3, 4, 5, 3, 4, 5]
const g2 = [5, 6, 7, 6, 5, 6, 7, 5, 6, 7]
const g3 = [7, 8, 9, 8, 7, 8, 9, 7, 8, 9]

// Dataset D: Correlation
const xVals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const yVals = [2.1, 4.0, 5.9, 8.1, 10.0, 11.9, 14.1, 16.0, 17.9, 20.1]

// Dataset E: Likert scale data (lots of ties)
const likertA = [3, 3, 4, 4, 4, 5, 5, 3, 4, 3, 2, 4, 5, 3, 4]
const likertB = [4, 5, 5, 5, 4, 5, 5, 4, 5, 4, 3, 5, 5, 4, 5]

// Dataset G: Scale items for Cronbach's alpha
const item1 = [4, 5, 3, 4, 5, 4, 3, 5, 4, 5, 3, 4, 5, 4, 3]
const item2 = [3, 4, 3, 4, 5, 3, 3, 4, 4, 5, 3, 4, 4, 3, 3]
const item3 = [4, 5, 4, 5, 5, 4, 3, 5, 4, 5, 3, 5, 5, 4, 3]
const item4 = [3, 4, 2, 3, 4, 3, 2, 4, 3, 4, 2, 3, 4, 3, 2]

// Dataset H: Regression
const regX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
const regY = regX.map(x => 2 * x + 3 + (x % 3 - 1) * 0.5)

// Dataset I: Ordinal/ranked data with many ties
const ordinalA = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5]
const ordinalB = [2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5]

// ============================================================
// TESTS
// ============================================================

describe('Helpers', () => {
  it('mean([1,2,3,4,5]) = 3.0', () => {
    expect(_helpers.mean([1, 2, 3, 4, 5])).toBeCloseTo(3.0)
  })
  it('median([1,2,3,4,5]) = 3.0', () => {
    expect(_helpers.median([1, 2, 3, 4, 5])).toBeCloseTo(3.0)
  })
  it('median([1,2,3,4]) = 2.5', () => {
    expect(_helpers.median([1, 2, 3, 4])).toBeCloseTo(2.5)
  })
  it('variance([2,4,4,4,5,5,7,9], ddof=1) = 4.571', () => {
    expect(_helpers.variance([2, 4, 4, 4, 5, 5, 7, 9], 1)).toBeCloseTo(4.571, 2)
  })
  it('sd([2,4,4,4,5,5,7,9], ddof=1) = 2.138', () => {
    expect(_helpers.sd([2, 4, 4, 4, 5, 5, 7, 9], 1)).toBeCloseTo(2.138, 2)
  })
})

describe('Independent t-test', () => {
  const tt = ttest(groupA, groupB)
  it('t-statistic ~ 4.78', () => {
    expect(Math.abs(tt.t)).toBeCloseTo(4.78, 0)
  })
  it('p < 0.001', () => {
    expect(tt.p).toBeLessThan(0.001)
  })
  it('Cohen d ~ 1.74', () => {
    expect(Math.abs(tt.cohensD)).toBeCloseTo(1.74, 0)
  })
  it('mean A = 4.8', () => {
    expect(tt.meanA).toBeCloseTo(4.8, 1)
  })
  it('mean B = 6.8', () => {
    expect(tt.meanB).toBeCloseTo(6.8, 1)
  })
  it('is significant', () => {
    expect(tt.p).toBeLessThan(0.05)
  })
})

describe('Paired t-test', () => {
  const pt = pairedTTest(before, after)
  it('mean diff = -4.0', () => {
    expect(pt.meanDiff).toBeCloseTo(-4.0, 1)
  })
  it('p < 0.001', () => {
    expect(pt.p).toBeLessThan(0.001)
  })
  it('is significant', () => {
    expect(pt.p).toBeLessThan(0.05)
  })
  it('n = 10', () => {
    expect(pt.n).toBe(10)
  })
})

describe('One-way ANOVA', () => {
  const av = anova([g1, g2, g3])
  it('is significant', () => {
    expect(av.p).toBeLessThan(0.001)
  })
  it('df between = 2', () => {
    expect(av.dfBetween).toBe(2)
  })
  it('df within = 27', () => {
    expect(av.dfWithin).toBe(27)
  })
  it('eta-squared > 0.7', () => {
    expect(av.etaSquared).toBeGreaterThan(0.7)
  })
})

describe('Welch ANOVA', () => {
  it('is significant', () => {
    const wa = welchAnova([g1, g2, g3])
    expect(wa.p).toBeLessThan(0.001)
  })
})

describe('Mann-Whitney U', () => {
  it('is significant', () => {
    const mw = mannWhitney(groupA, groupB)
    expect(mw.p).toBeLessThan(0.05)
  })
  it('nA = 15, nB = 15', () => {
    const mw = mannWhitney(groupA, groupB)
    expect(mw.nA).toBe(15)
    expect(mw.nB).toBe(15)
  })
  it('handles tied data', () => {
    const mwTied = mannWhitney(likertA, likertB)
    expect(typeof mwTied.p).toBe('number')
    expect(mwTied.p).not.toBeNaN()
    expect(mwTied.p).toBeGreaterThanOrEqual(0)
    expect(mwTied.p).toBeLessThanOrEqual(1)
  })
})

describe('Wilcoxon Signed-Rank', () => {
  it('is significant', () => {
    const wc = wilcoxon(before, after)
    expect(wc.p).toBeLessThan(0.05)
  })
})

describe('Kruskal-Wallis', () => {
  it('is significant', () => {
    const kw = kruskalWallis([g1, g2, g3])
    expect(kw.p).toBeLessThan(0.05)
  })
  it('df = 2', () => {
    const kw = kruskalWallis([g1, g2, g3])
    expect(kw.df).toBe(2)
  })
  it('handles tied data', () => {
    const kwTied = kruskalWallis([likertA, likertB, ordinalA])
    expect(typeof kwTied.p).toBe('number')
    expect(kwTied.p).not.toBeNaN()
  })
})

describe('Friedman Test', () => {
  it('is significant', () => {
    const fr = friedman([g1, g2, g3])
    expect(fr.p).toBeLessThan(0.05)
  })
})

describe('Repeated Measures ANOVA', () => {
  it('is significant', () => {
    const rm = repeatedMeasuresAnova([g1, g2, g3])
    expect(rm.p).toBeLessThan(0.05)
  })
  it('partial eta-squared > 0.5', () => {
    const rm = repeatedMeasuresAnova([g1, g2, g3])
    expect(rm.etaSquared).toBeGreaterThan(0.5)
  })
})

describe('Two-Way ANOVA', () => {
  const outcome2 = [3, 4, 5, 6, 5, 6, 7, 8, 4, 5, 6, 7, 6, 7, 8, 9]
  const factor1 = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]
  const factor2 = [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]
  it('has valid p-values', () => {
    const tw = twoWayAnova(outcome2, factor1, factor2)
    expect(typeof tw.mainA.p).toBe('number')
    expect(typeof tw.mainB.p).toBe('number')
    expect(typeof tw.interaction.p).toBe('number')
  })
})

describe('Pearson Correlation', () => {
  it('r near 1 for near-perfect linear data', () => {
    const pc = pearson(xVals, yVals)
    expect(pc.r).toBeCloseTo(1.0, 2)
  })
  it('is significant', () => {
    const pc = pearson(xVals, yVals)
    expect(pc.p).toBeLessThan(0.001)
  })
  it('n = 10', () => {
    const pc = pearson(xVals, yVals)
    expect(pc.n).toBe(10)
  })
  it('random data has |r| < 0.5', () => {
    const randX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const randY = [5, 3, 8, 2, 9, 1, 7, 4, 6, 10]
    const pcRand = pearson(randX, randY)
    expect(Math.abs(pcRand.r)).toBeLessThan(0.5)
  })
  it('n=3 has CI', () => {
    const pcSmall = pearson([1, 2, 3], [2, 4, 6])
    expect(pcSmall.ci95).toBeDefined()
  })
  it('n=2 gives r = 1', () => {
    const pc2 = pearson([1, 2], [3, 5])
    expect(pc2.r).toBeCloseTo(1.0, 2)
  })
})

describe('Spearman Correlation', () => {
  it('rho near 1', () => {
    const sp = spearman(xVals, yVals)
    expect(sp.rho).toBeCloseTo(1.0, 1)
  })
  it('is significant', () => {
    const sp = spearman(xVals, yVals)
    expect(sp.p).toBeLessThan(0.05)
  })
})

describe("Kendall's Tau", () => {
  it('tau near 1', () => {
    const kt = kendallTau(xVals, yVals)
    expect(kt.tau).toBeCloseTo(1.0, 1)
  })
  it('is significant', () => {
    const kt = kendallTau(xVals, yVals)
    expect(kt.p).toBeLessThan(0.05)
  })
  it('handles tied data', () => {
    const ktTied = kendallTau(ordinalA, ordinalB)
    expect(typeof ktTied.p).toBe('number')
    expect(ktTied.p).not.toBeNaN()
    expect(ktTied.p).toBeGreaterThanOrEqual(0)
    expect(ktTied.p).toBeLessThanOrEqual(1)
  })
})

describe('Chi-Square', () => {
  it('is significant', () => {
    const cs = chiSquare([[20, 30], [40, 10]])
    expect(cs.p).toBeLessThan(0.05)
  })
  it('df = 1', () => {
    const cs = chiSquare([[20, 30], [40, 10]])
    expect(cs.df).toBe(1)
  })
  it("Cramer's V > 0", () => {
    const cs = chiSquare([[20, 30], [40, 10]])
    expect(cs.cramersV).toBeGreaterThan(0)
  })
  it('chi-sq value ~ 16.67', () => {
    const cs = chiSquare([[20, 30], [40, 10]])
    expect(cs.chiSquare).toBeCloseTo(16.67, 0)
  })
})

describe("Fisher's Exact", () => {
  it('returns valid p', () => {
    const fe = fisherExact(5, 1, 1, 5)
    expect(typeof fe.p).toBe('number')
    expect(fe.p).not.toBeNaN()
    expect(fe.p).toBeGreaterThanOrEqual(0)
    expect(fe.p).toBeLessThanOrEqual(1)
  })
  it('N=200 is significant', () => {
    const feLarge = fisherExact(80, 20, 30, 70)
    expect(feLarge.p).toBeLessThan(0.05)
    expect(feLarge.p).not.toBeNaN()
  })
  it('N=400 no overflow', () => {
    const feHuge = fisherExact(150, 50, 60, 140)
    expect(typeof feHuge.p).toBe('number')
    expect(feHuge.p).not.toBeNaN()
  })
  it('N=1600 no overflow', () => {
    const feMassive = fisherExact(500, 200, 300, 600)
    expect(typeof feMassive.p).toBe('number')
    expect(feMassive.p).not.toBeNaN()
  })
})

describe('Simple Linear Regression', () => {
  it('R-squared > 0.99', () => {
    const sr = linearRegression(regY, [regX])
    expect(sr.R2).toBeGreaterThan(0.99)
  })
  it('slope near 2', () => {
    const sr = linearRegression(regY, [regX])
    expect(sr.coefficients[1]).toBeCloseTo(2.0, 0)
  })
  it('intercept near 3', () => {
    const sr = linearRegression(regY, [regX])
    expect(sr.coefficients[0]).toBeCloseTo(3.0, 0)
  })
  it('is significant', () => {
    const sr = linearRegression(regY, [regX])
    expect(sr.fP).toBeLessThan(0.05)
  })
})

describe('Multiple Linear Regression', () => {
  const x1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
  const x2 = [2, 4, 1, 3, 5, 2, 4, 1, 3, 5, 2, 4, 1, 3, 5]
  const yMult = x1.map((v, i) => 3 * v + 2 * x2[i] + 5)
  it('R-squared = 1', () => {
    const mr = linearRegression(yMult, [x1, x2])
    expect(mr.R2).toBeCloseTo(1.0, 1)
  })
  it('coeff x1 near 3', () => {
    const mr = linearRegression(yMult, [x1, x2])
    expect(mr.coefficients[1]).toBeCloseTo(3.0, 0)
  })
  it('coeff x2 near 2', () => {
    const mr = linearRegression(yMult, [x1, x2])
    expect(mr.coefficients[2]).toBeCloseTo(2.0, 0)
  })
})

describe('Logistic Regression', () => {
  const logX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
  const logY = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
  it('converges', () => {
    const lr = logisticRegression(logY, [logX])
    expect(lr.converged).not.toBe(false)
  })
  it('positive slope', () => {
    const lr = logisticRegression(logY, [logX])
    expect(lr.coefficients[1]).toBeGreaterThan(0)
  })
  it('OR > 1', () => {
    const lr = logisticRegression(logY, [logX])
    expect(lr.oddsRatios[1]).toBeGreaterThan(1)
  })
})

describe("Cronbach's Alpha", () => {
  const ca = cronbachAlpha([item1, item2, item3, item4])
  it('alpha between 0 and 1', () => {
    expect(ca.alpha).toBeGreaterThanOrEqual(0)
    expect(ca.alpha).toBeLessThanOrEqual(1)
  })
  it('alpha > 0.5', () => {
    expect(ca.alpha).toBeGreaterThan(0.5)
  })
  it('k = 4', () => {
    expect(ca.k).toBe(4)
  })
  it('has alphaIfDeleted array of length 4', () => {
    expect(Array.isArray(ca.alphaIfDeleted)).toBe(true)
    expect(ca.alphaIfDeleted.length).toBe(4)
  })
})

describe('PCA', () => {
  it('has eigenvalues', () => {
    const p = pca([item1, item2, item3, item4])
    expect(Array.isArray(p.eigenvalues)).toBe(true)
  })
  it('eigenvalues sum to nItems', () => {
    const p = pca([item1, item2, item3, item4])
    const evSum = p.eigenvalues.reduce((a: number, b: number) => a + b, 0)
    expect(Math.abs(evSum - 4)).toBeLessThan(0.1)
  })
  it('first eigenvalue is largest', () => {
    const p = pca([item1, item2, item3, item4])
    expect(p.eigenvalues[0]).toBeGreaterThanOrEqual(p.eigenvalues[1])
  })
})

describe('Factor Analysis', () => {
  it('has loadings and variance explained', () => {
    const fa = factorAnalysis([item1, item2, item3, item4], { nFactors: 1 })
    expect(fa.loadings).toBeDefined()
    expect(fa.explainedVariance).toBeDefined()
  })
})

describe('K-Means', () => {
  const kmX = [1, 2, 1, 2, 1, 10, 11, 10, 11, 10]
  const kmY = [1, 1, 2, 2, 1, 10, 10, 11, 11, 10]
  it('produces 2 clusters', () => {
    const km = kMeans([kmX, kmY], 2)
    expect(km.k).toBe(2)
  })
  it('n = 10', () => {
    const km = kMeans([kmX, kmY], 2)
    expect(km.n).toBe(10)
  })
  it('separates two clear clusters', () => {
    const km = kMeans([kmX, kmY], 2)
    const cluster0 = km.assignments[0]
    const allFirstSame = km.assignments.slice(0, 5).every((a: number) => a === cluster0)
    const allSecondSame = km.assignments.slice(5).every((a: number) => a === km.assignments[5])
    expect(allFirstSame).toBe(true)
    expect(allSecondSame).toBe(true)
    expect(km.assignments[0]).not.toBe(km.assignments[5])
  })
})

describe('Shapiro-Wilk', () => {
  it('normal data passes (p > 0.05)', () => {
    const normalData = [2.3, 3.1, 2.8, 3.5, 2.9, 3.2, 2.7, 3.0, 3.3, 2.6, 3.1, 2.8, 3.4, 2.9, 3.0, 2.8, 3.2, 2.7, 3.1, 2.9]
    const sw = shapiroWilk(normalData)
    expect(sw.W).toBeGreaterThanOrEqual(0)
    expect(sw.W).toBeLessThanOrEqual(1)
    expect(sw.p).toBeGreaterThan(0.05)
  })
  it('bimodal data fails (p < 0.05)', () => {
    const bimodal = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
    const swBi = shapiroWilk(bimodal)
    expect(swBi.p).toBeLessThan(0.05)
  })
})

describe("Levene's Test", () => {
  it('equal variances p > 0.05', () => {
    const lev = levene([g1, g2, g3])
    expect(lev.p).toBeGreaterThan(0.05)
  })
  it('unequal variances p < 0.05', () => {
    const highVar = [1, 10, 2, 9, 3, 8, 4, 7, 5, 6]
    const lowVar = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    const levUneq = levene([highVar, lowVar])
    expect(levUneq.p).toBeLessThan(0.05)
  })
})

describe('Point-Biserial', () => {
  it('r > 0.8 for clearly separated groups', () => {
    const binary = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1]
    const contin = [3, 4, 3, 2, 4, 3, 3, 7, 8, 7, 6, 8, 7, 7]
    const pb = pointBiserial(binary, contin)
    expect(Math.abs(pb.r)).toBeGreaterThan(0.8)
    expect(pb.p).toBeLessThan(0.05)
  })
})

describe('Edge Cases', () => {
  it('t-test n=1 returns result', () => {
    const tt1 = ttest([5], [3])
    expect(tt1).toBeDefined()
  })
  it('t-test zero variance has p', () => {
    const ttZero = ttest([5, 5, 5, 5, 5], [3, 3, 3, 3, 3])
    expect(typeof ttZero.p).toBe('number')
  })
  it('Mann-Whitney all same values has p', () => {
    const mwSame = mannWhitney([3, 3, 3, 3, 3], [3, 3, 3, 3, 3])
    expect(typeof mwSame.p).toBe('number')
  })
  it('t-test empty A does not crash', () => {
    expect(() => ttest([], [1, 2, 3])).not.toThrow()
  })
  it('Pearson empty does not crash', () => {
    expect(() => pearson([], [])).not.toThrow()
  })
})

describe('Hierarchical Clustering', () => {
  const kmX = [1, 2, 1, 2, 1, 10, 11, 10, 11, 10]
  const kmY = [1, 1, 2, 2, 1, 10, 10, 11, 11, 10]
  it('n = 10', () => {
    const hc = hierarchicalClustering([kmX, kmY], 'average')
    expect(hc.n).toBe(10)
  })
  it('cutTree(2) returns array of length 10', () => {
    const hc = hierarchicalClustering([kmX, kmY], 'average')
    const assignments = hc.cutTree(2)
    expect(Array.isArray(assignments)).toBe(true)
    expect(assignments.length).toBe(10)
  })
})

describe('Latent Class Analysis', () => {
  it('identifies 2 classes', () => {
    const lcaBin1 = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
    const lcaBin2 = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0]
    const lcaBin3 = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]
    const lca = latentClassAnalysis([lcaBin1, lcaBin2, lcaBin3], 2)
    expect(lca.nClasses).toBe(2)
    expect(Array.isArray(lca.assignments)).toBe(true)
  })
})

describe('Difference-in-Differences', () => {
  it('returns valid estimate', () => {
    const didY = [10, 11, 12, 10, 11, 12, 15, 16, 17, 20, 21, 22]
    const didT = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]
    const didP = [0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1]
    const did = diffInDiff(didY, didT, didP)
    expect(typeof did.didEstimate).toBe('number')
    expect(did.N).toBe(12)
  })
})
