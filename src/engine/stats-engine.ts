/**
 * Market Research Statistics Toolkit — Stats Engine (v2 TypeScript)
 * Migrated from v1 stats-engine.js — logic preserved verbatim.
 *
 * RULES:
 * - Zero imports from React, Zustand, DOM, or window
 * - Pure computation only — no side effects
 * - All functions are named exports
 */

import jStat from 'jstat';


/* ================================================================
 *  INTERNAL HELPERS  (math / rank / percentile / etc.)
 * ================================================================ */

function sum(arr: number[]): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? NaN : sum(arr) / arr.length;
}

function variance(arr: number[], ddof?: number): number {
  if (ddof === undefined) ddof = 1;
  let m = mean(arr);
  let ss = 0;
  for (let i = 0; i < arr.length; i++) ss += (arr[i] - m) * (arr[i] - m);
  return ss / (arr.length - ddof);
}

function sd(arr: number[], ddof?: number): number {
  return Math.sqrt(variance(arr, ddof));
}

function median(arr: number[]): number {
  let s = arr.slice().sort(function (a: number, b: number) { return a - b; });
  let mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mode(arr: number[]): number[] {
  let freq: Record<string, number> = {};
  let maxF = 0;
  let modes: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    let v = arr[i];
    freq[v] = (freq[v] || 0) + 1;
    if (freq[v] > maxF) maxF = freq[v];
  }
  for (let key in freq) {
    if (freq[key] === maxF) modes.push(Number(key));
  }
  return modes.length === arr.length ? [] : modes;
}

function percentile(arr: number[], p: number): number {
  let s = arr.slice().sort(function (a: number, b: number) { return a - b; });
  let idx = (p / 100) * (s.length - 1);
  let lo = Math.floor(idx);
  let hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (idx - lo) * (s[hi] - s[lo]);
}

function iqr(arr: number[]): number {
  return percentile(arr, 75) - percentile(arr, 25);
}

function skewness(arr: number[]): number {
  let n = arr.length;
  let m = mean(arr);
  let s = sd(arr, 1);
  if (s === 0 || n < 3) return 0;
  let s3 = 0;
  for (let i = 0; i < n; i++) s3 += Math.pow((arr[i] - m) / s, 3);
  return (n / ((n - 1) * (n - 2))) * s3;
}

function kurtosis(arr: number[]): number {
  let n = arr.length;
  let m = mean(arr);
  let s = sd(arr, 1);
  if (s === 0 || n < 4) return 0;
  let s4 = 0;
  for (let i = 0; i < n; i++) s4 += Math.pow((arr[i] - m) / s, 4);
  let k = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * s4;
  k -= (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  return k; // excess kurtosis
}

function rank(arr: number[]): number[] {
  let indexed = arr.map(function (v: number, i: number) { return { v: v, i: i }; });
  indexed.sort(function (a: any, b: any) { return a.v - b.v; });
  let ranks = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    let avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

function confidenceInterval(arr: number[], confidence?: number): { lower: number; upper: number; mean: number; se: number } {
  if (confidence === undefined) confidence = 0.95;
  let n = arr.length;
  let m = mean(arr);
  let se = sd(arr, 1) / Math.sqrt(n);
  let alpha = 1 - confidence;
  let tCrit = jStat.studentt.inv(1 - alpha / 2, n - 1);
  return { lower: m - tCrit * se, upper: m + tCrit * se, mean: m, se: se };
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function choose(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  return factorial(n) / (factorial(k) * factorial(n - k));
}

/* ================================================================
 *  detectType  — auto-detect variable type from values
 * ================================================================ */

export function detectType(values: any[]): string {
  if (!values || values.length === 0) return "empty";

  let nonNull = values.filter(function (v: any) { return v !== null && v !== undefined && v !== ""; });
  if (nonNull.length === 0) return "empty";

  let numCount = 0;
  let unique: Record<string, boolean> = {};
  for (let i = 0; i < nonNull.length; i++) {
    let v = nonNull[i];
    if (typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && v.trim() !== "")) {
      numCount++;
    }
    unique[String(v)] = true;
  }

  let numRatio = numCount / nonNull.length;
  let uniqueCount = Object.keys(unique).length;

  if (numRatio > 0.8) {
    if (uniqueCount <= 2) return "binary";
    if (uniqueCount <= 7 && uniqueCount < nonNull.length * 0.1) return "ordinal";
    return "continuous";
  }

  if (uniqueCount <= 2) return "binary";
  if (uniqueCount <= 20) return "nominal";
  return "text";
}

/* ================================================================
 *  DESCRIPTIVE STATISTICS
 * ================================================================ */

export function describe(values: any[]): any {
  if (!values || !values.length) return { error: 'Values must be non-empty', valid: false };
  let nums = values
    .map(function (v: any) { return typeof v === "number" ? v : Number(v); })
    .filter(function (v: number) { return !isNaN(v); });

  if (nums.length === 0) {
    return { n: 0, mean: NaN, median: NaN, mode: [], sd: NaN, variance: NaN, min: NaN, max: NaN, range: NaN, iqr: NaN, skewness: NaN, kurtosis: NaN, p25: NaN, p50: NaN, p75: NaN, p5: NaN, p95: NaN, ci95: null, se: NaN };
  }

  let sorted = nums.slice().sort(function (a: number, b: number) { return a - b; });
  let ci = confidenceInterval(nums);

  return {
    n: nums.length,
    mean: mean(nums),
    median: median(nums),
    mode: mode(nums),
    sd: sd(nums, 1),
    variance: variance(nums, 1),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    range: sorted[sorted.length - 1] - sorted[0],
    iqr: iqr(nums),
    skewness: skewness(nums),
    kurtosis: kurtosis(nums),
    p5: percentile(nums, 5),
    p25: percentile(nums, 25),
    p50: percentile(nums, 50),
    p75: percentile(nums, 75),
    p95: percentile(nums, 95),
    ci95: ci,
    se: sd(nums, 1) / Math.sqrt(nums.length)
  };
}

/* ================================================================
 *  INDEPENDENT TWO-SAMPLE T-TEST  (Welch's correction)
 * ================================================================ */

export function ttest(a: number[], b: number[]): any {
  let nA = a.length, nB = b.length;
  let mA = mean(a), mB = mean(b);
  let vA = variance(a, 1), vB = variance(b, 1);
  let se = Math.sqrt(vA / nA + vB / nB);
  let t = (mA - mB) / se;

  // Welch-Satterthwaite df
  let num = Math.pow(vA / nA + vB / nB, 2);
  let den = Math.pow(vA / nA, 2) / (nA - 1) + Math.pow(vB / nB, 2) / (nB - 1);
  let df = num / den;

  let p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

  // Cohen's d (pooled SD)
  let pooledSD = Math.sqrt(((nA - 1) * vA + (nB - 1) * vB) / (nA + nB - 2));
  let cohensD = pooledSD === 0 ? 0 : (mA - mB) / pooledSD;

  // 95% CI for the difference
  let tCrit = jStat.studentt.inv(0.975, df);
  let ciLower = (mA - mB) - tCrit * se;
  let ciUpper = (mA - mB) + tCrit * se;

  return {
    test: "Independent t-test (Welch)",
    t: t,
    df: df,
    p: p,
    meanA: mA,
    meanB: mB,
    meanDiff: mA - mB,
    sdA: Math.sqrt(vA),
    sdB: Math.sqrt(vB),
    se: se,
    cohensD: cohensD,
    ci95: { lower: ciLower, upper: ciUpper },
    nA: nA,
    nB: nB
  };
}

/* ================================================================
 *  PAIRED T-TEST
 * ================================================================ */

export function pairedTTest(a: number[], b: number[]): any {
  if (!a || !b || !a.length || !b.length) return { error: 'Arrays must be non-empty', valid: false };
  if (a.length !== b.length) return { error: "Paired t-test requires equal-length arrays", valid: false };
  let n = a.length;
  let diffs: number[] = [];
  for (let i = 0; i < n; i++) diffs.push(a[i] - b[i]);
  let mD = mean(diffs);
  let sD = sd(diffs, 1);
  let se = sD / Math.sqrt(n);
  let t = mD / se;
  let df = n - 1;
  let p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

  let tCrit = jStat.studentt.inv(0.975, df);
  let cohensD = sD === 0 ? 0 : mD / sD;

  return {
    test: "Paired t-test",
    t: t,
    df: df,
    p: p,
    meanDiff: mD,
    sdDiff: sD,
    se: se,
    cohensD: cohensD,
    ci95: { lower: mD - tCrit * se, upper: mD + tCrit * se },
    n: n
  };
}

/* ================================================================
 *  ONE-WAY ANOVA  (with eta-squared + post-hoc pairwise)
 * ================================================================ */

export function anova(groups: number[][]): any {
  let k = groups.length;
  let allVals: number[] = [];
  let ns: number[] = [];
  let means: number[] = [];
  for (let i = 0; i < k; i++) {
    ns.push(groups[i].length);
    means.push(mean(groups[i]));
    for (let j = 0; j < groups[i].length; j++) allVals.push(groups[i][j]);
  }
  let grandMean = mean(allVals);
  let N = allVals.length;

  // Sum of squares
  let SSB = 0;
  for (let i = 0; i < k; i++) SSB += ns[i] * Math.pow(means[i] - grandMean, 2);

  let SSW = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < groups[i].length; j++) {
      SSW += Math.pow(groups[i][j] - means[i], 2);
    }
  }

  let SST = SSB + SSW;
  let dfBetween = k - 1;
  let dfWithin = N - k;
  let MSB = SSB / dfBetween;
  let MSW = SSW / dfWithin;
  let F = MSB / MSW;
  let p = 1 - jStat.centralF.cdf(F, dfBetween, dfWithin);
  let etaSquared = SSB / SST;

  // Post-hoc pairwise comparisons (Bonferroni-corrected t-tests)
  let posthoc: any[] = [];
  let numComparisons = k * (k - 1) / 2;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      let res = ttest(groups[i], groups[j]);
      posthoc.push({
        groupA: i,
        groupB: j,
        meanDiff: means[i] - means[j],
        t: res.t,
        p: res.p,
        pBonferroni: Math.min(1, res.p * numComparisons),
        cohensD: res.cohensD,
        ci95: res.ci95
      });
    }
  }

  return {
    test: "One-way ANOVA",
    F: F,
    p: p,
    dfBetween: dfBetween,
    dfWithin: dfWithin,
    SSB: SSB,
    SSW: SSW,
    SST: SST,
    MSB: MSB,
    MSW: MSW,
    etaSquared: etaSquared,
    grandMean: grandMean,
    groupMeans: means,
    groupNs: ns,
    k: k,
    N: N,
    posthoc: posthoc
  };
}

/* ================================================================
 *  MANN-WHITNEY U
 * ================================================================ */

export function mannWhitney(a: number[], b: number[]): any {
  let nA = a.length, nB = b.length;
  let combined: any[] = [];
  for (let i = 0; i < nA; i++) combined.push({ v: a[i], g: 0 });
  for (let i = 0; i < nB; i++) combined.push({ v: b[i], g: 1 });

  // Rank all values
  let vals = combined.map(function (x: any) { return x.v; });
  let ranks = rank(vals);

  let R1 = 0, R2 = 0;
  for (let i = 0; i < combined.length; i++) {
    if (combined[i].g === 0) R1 += ranks[i];
    else R2 += ranks[i];
  }

  let U1 = R1 - nA * (nA + 1) / 2;
  let U2 = R2 - nB * (nB + 1) / 2;
  let U = Math.min(U1, U2);

  // Normal approximation (with continuity correction)
  let mU = nA * nB / 2;
  // Tie correction: count tie groups from ranks
  let N = nA + nB;
  let tieCorr = 0;
  let ri = 0;
  let sortedRanks = ranks.slice().sort(function (a: number, b: number) { return a - b; });
  while (ri < sortedRanks.length) {
    let rj = ri;
    while (rj < sortedRanks.length && sortedRanks[rj] === sortedRanks[ri]) rj++;
    let t = rj - ri;
    if (t > 1) tieCorr += (t * t * t - t);
    ri = rj;
  }
  let sigmaU = Math.sqrt((nA * nB / 12) * ((N + 1) - tieCorr / (N * (N - 1))));
  let z = (U - mU) / sigmaU;
  let p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));

  // Effect size r = z / sqrt(N)
  let r = z / Math.sqrt(nA + nB);

  return {
    test: "Mann-Whitney U",
    U: U,
    U1: U1,
    U2: U2,
    z: z,
    p: p,
    r: Math.abs(r),
    rankSumA: R1,
    rankSumB: R2,
    nA: nA,
    nB: nB
  };
}

/* ================================================================
 *  WILCOXON SIGNED-RANK TEST
 * ================================================================ */

export function wilcoxon(a: number[], b: number[]): any {
  if (!a || !b || !a.length || !b.length) return { error: 'Arrays must be non-empty', valid: false };
  if (a.length !== b.length) return { error: "Wilcoxon requires equal-length arrays", valid: false };
  let n = a.length;
  let diffs: number[] = [];
  for (let i = 0; i < n; i++) {
    let d = a[i] - b[i];
    if (d !== 0) diffs.push(d);
  }

  let nr = diffs.length; // non-zero pairs
  let absDiffs = diffs.map(Math.abs);
  let ranks_arr = rank(absDiffs);

  let Wplus = 0, Wminus = 0;
  for (let i = 0; i < nr; i++) {
    if (diffs[i] > 0) Wplus += ranks_arr[i];
    else Wminus += ranks_arr[i];
  }

  let W = Math.min(Wplus, Wminus);

  // Normal approximation with tie correction
  let mW = nr * (nr + 1) / 4;
  let tieCorrW = 0;
  let sri = 0;
  let sortedAbsRanks = ranks_arr.slice().sort(function (a: number, b: number) { return a - b; });
  while (sri < sortedAbsRanks.length) {
    let srj = sri;
    while (srj < sortedAbsRanks.length && sortedAbsRanks[srj] === sortedAbsRanks[sri]) srj++;
    let tw = srj - sri;
    if (tw > 1) tieCorrW += (tw * tw * tw - tw);
    sri = srj;
  }
  let sigmaW = Math.sqrt((nr * (nr + 1) * (2 * nr + 1) - tieCorrW / 2) / 24);
  let z = sigmaW === 0 ? 0 : (W - mW) / sigmaW;
  let p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
  let r = nr > 0 ? Math.abs(z) / Math.sqrt(nr) : 0;

  return {
    test: "Wilcoxon Signed-Rank",
    W: W,
    Wplus: Wplus,
    Wminus: Wminus,
    z: z,
    p: p,
    r: r,
    nPairs: n,
    nNonZero: nr
  };
}

/* ================================================================
 *  KRUSKAL-WALLIS  (with post-hoc Dunn's test)
 * ================================================================ */

export function kruskalWallis(groups: number[][]): any {
  let k = groups.length;
  let combined: any[] = [];
  let ns: number[] = [];
  for (let i = 0; i < k; i++) {
    ns.push(groups[i].length);
    for (let j = 0; j < groups[i].length; j++) {
      combined.push({ v: groups[i][j], g: i });
    }
  }
  let N = combined.length;
  let vals = combined.map(function (x: any) { return x.v; });
  let ranks_arr = rank(vals);

  let rankSums = new Array(k);
  for (let i = 0; i < k; i++) rankSums[i] = 0;

  for (let i = 0; i < combined.length; i++) {
    rankSums[combined[i].g] += ranks_arr[i];
  }

  let meanRanks = rankSums.map(function (r: number, i: number) { return r / ns[i]; });

  // H statistic
  let H = 0;
  for (let i = 0; i < k; i++) {
    H += (rankSums[i] * rankSums[i]) / ns[i];
  }
  H = (12 / (N * (N + 1))) * H - 3 * (N + 1);

  // Tie correction for Kruskal-Wallis
  let tieCorrKW = 0;
  let ki2 = 0;
  let sortedKWRanks = ranks_arr.slice().sort(function (a: number, b: number) { return a - b; });
  while (ki2 < sortedKWRanks.length) {
    let kj = ki2;
    while (kj < sortedKWRanks.length && sortedKWRanks[kj] === sortedKWRanks[ki2]) kj++;
    let tk = kj - ki2;
    if (tk > 1) tieCorrKW += (tk * tk * tk - tk);
    ki2 = kj;
  }
  let tieDenom = 1 - tieCorrKW / (N * N * N - N);
  if (tieDenom > 0) H = H / tieDenom;

  let df = k - 1;
  let p = 1 - jStat.chisquare.cdf(H, df);

  // Eta-squared approximation
  let etaH = (H - k + 1) / (N - k);

  // Post-hoc: Dunn's test (Bonferroni)
  let posthoc: any[] = [];
  let numComparisons = k * (k - 1) / 2;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      let seDunn = Math.sqrt((N * (N + 1) / 12) * (1 / ns[i] + 1 / ns[j]));
      let zDunn = (meanRanks[i] - meanRanks[j]) / seDunn;
      let pDunn = 2 * (1 - jStat.normal.cdf(Math.abs(zDunn), 0, 1));
      posthoc.push({
        groupA: i,
        groupB: j,
        meanRankDiff: meanRanks[i] - meanRanks[j],
        z: zDunn,
        p: pDunn,
        pBonferroni: Math.min(1, pDunn * numComparisons)
      });
    }
  }

  return {
    test: "Kruskal-Wallis",
    H: H,
    df: df,
    p: p,
    etaSquared: etaH,
    meanRanks: meanRanks,
    rankSums: rankSums,
    ns: ns,
    k: k,
    N: N,
    posthoc: posthoc
  };
}

/* ================================================================
 *  CHI-SQUARE TEST OF INDEPENDENCE
 * ================================================================ */

export function chiSquare(observed: number[][]): any {
  let nRows = observed.length;
  let nCols = observed[0].length;
  let N = 0;
  let rowTotals: number[] = [];
  let colTotals = new Array(nCols);
  for (let c = 0; c < nCols; c++) colTotals[c] = 0;

  for (let r = 0; r < nRows; r++) {
    let rt = 0;
    for (let c = 0; c < nCols; c++) {
      rt += observed[r][c];
      colTotals[c] += observed[r][c];
      N += observed[r][c];
    }
    rowTotals.push(rt);
  }

  // Expected frequencies
  let expected: number[][] = [];
  let chi2 = 0;
  let anySmallExpected = false;
  for (let r = 0; r < nRows; r++) {
    expected.push([]);
    for (let c = 0; c < nCols; c++) {
      let e = (rowTotals[r] * colTotals[c]) / N;
      expected[r].push(e);
      if (e < 5) anySmallExpected = true;
      chi2 += Math.pow(observed[r][c] - e, 2) / e;
    }
  }

  let df = (nRows - 1) * (nCols - 1);
  let p = 1 - jStat.chisquare.cdf(chi2, df);

  // Cramer's V
  let minDim = Math.min(nRows, nCols) - 1;
  let cramersV = minDim > 0 ? Math.sqrt(chi2 / (N * minDim)) : 0;

  return {
    test: "Chi-Square Test of Independence",
    chiSquare: chi2,
    df: df,
    p: p,
    cramersV: cramersV,
    expected: expected,
    observed: observed,
    rowTotals: rowTotals,
    colTotals: colTotals,
    N: N,
    warning: anySmallExpected ? "Some expected frequencies are below 5. Consider Fisher's exact test." : null
  };
}

/* ================================================================
 *  FISHER'S EXACT TEST  (2x2)
 * ================================================================ */

function lnFactorial(n: number): number { return jStat.gammaln(n + 1); }
function lnChoose(n: number, k: number): number { return lnFactorial(n) - lnFactorial(k) - lnFactorial(n - k); }

export function fisherExact(a: number, b: number, c: number, d: number): any {
  // 2x2 table:  [[a, b], [c, d]]
  let n = a + b + c + d;
  let r1 = a + b, r2 = c + d;
  let c1 = a + c, c2 = b + d;

  function lnHypergeomPMF(x: number, N: number, K: number, nn: number): number {
    return lnChoose(K, x) + lnChoose(N - K, nn - x) - lnChoose(N, nn);
  }

  let lnPObserved = lnHypergeomPMF(a, n, c1, r1);
  let pValue = 0;

  let minA = Math.max(0, r1 - c2);
  let maxA = Math.min(r1, c1);
  for (let x = minA; x <= maxA; x++) {
    let lnPx = lnHypergeomPMF(x, n, c1, r1);
    if (lnPx <= lnPObserved + 1e-10) pValue += Math.exp(lnPx);
  }

  // Odds ratio
  let oddsRatio = (b === 0 || c === 0) ? Infinity : (a * d) / (b * c);

  return {
    test: "Fisher's Exact Test (2x2)",
    p: Math.min(1, pValue),
    oddsRatio: oddsRatio,
    table: [[a, b], [c, d]],
    N: n
  };
}

/* ================================================================
 *  MCNEMAR'S TEST
 * ================================================================ */

export function mcnemar(a: number, b: number, c: number, d: number): any {
  let chi2 = (b + c) > 0 ? Math.pow(Math.abs(b - c) - 1, 2) / (b + c) : 0;
  let df = 1;
  let p = 1 - jStat.chisquare.cdf(chi2, df);

  return {
    test: "McNemar's Test",
    chiSquare: chi2,
    df: df,
    p: p,
    b: b,
    c: c,
    table: [[a, b], [c, d]]
  };
}

/* ================================================================
 *  TWO-PROPORTION Z-TEST
 * ================================================================ */

export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): any {
  let p1 = x1 / n1;
  let p2 = x2 / n2;
  let pPool = (x1 + x2) / (n1 + n2);
  let se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  let z = se === 0 ? 0 : (p1 - p2) / se;
  let p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));

  let seDiff = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
  let zCrit = 1.96;

  return {
    test: "Two-Proportion z-test",
    z: z,
    p: p,
    p1: p1,
    p2: p2,
    diff: p1 - p2,
    ci95: { lower: (p1 - p2) - zCrit * seDiff, upper: (p1 - p2) + zCrit * seDiff },
    n1: n1,
    n2: n2
  };
}

/* ================================================================
 *  SHAPIRO-WILK NORMALITY TEST
 * ================================================================ */

export function shapiroWilk(x: number[]): any {
  let n = x.length;
  if (n < 3 || n > 5000) return { test: "Shapiro-Wilk", W: NaN, p: NaN, warning: "n must be between 3 and 5000" };

  let sorted = x.slice().sort(function (a: number, b: number) { return a - b; });
  let m = mean(sorted);

  let s2 = 0;
  for (let i = 0; i < n; i++) s2 += (sorted[i] - m) * (sorted[i] - m);

  let mtilde: number[] = [];
  for (let i = 0; i < n; i++) {
    let p_i = (i + 1 - 0.375) / (n + 0.25);
    mtilde.push(jStat.normal.inv(p_i, 0, 1));
  }

  let mNorm = 0;
  for (let i = 0; i < n; i++) mNorm += mtilde[i] * mtilde[i];
  mNorm = Math.sqrt(mNorm);

  let a = mtilde.map(function (v: number) { return v / mNorm; });

  let num2 = 0;
  for (let i = 0; i < n; i++) num2 += a[i] * sorted[i];
  num2 = num2 * num2;

  let W = num2 / s2;

  let mu: number, sigma: number, gamma2: number;
  let lnN = Math.log(n);

  if (n <= 11) {
    gamma2 = -2.273 + 0.459 * n;
    mu = 0.544 - 0.39978 * n + 0.025054 * n * n - 0.0006714 * n * n * n;
    sigma = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n * n - 0.0020322 * n * n * n);
    let z2 = (-Math.log(gamma2 - Math.log(1 - W)) - mu) / sigma;
    let pVal = 1 - jStat.normal.cdf(z2, 0, 1);
    return { test: "Shapiro-Wilk", W: W, p: Math.max(0, Math.min(1, pVal)), n: n };
  } else {
    let u = Math.log(1 - W);
    mu = 0.0038915 * Math.pow(lnN, 3) - 0.083751 * Math.pow(lnN, 2) - 0.31082 * lnN - 1.5861;
    sigma = Math.exp(0.0030302 * Math.pow(lnN, 2) - 0.082676 * lnN - 0.4803);
    let z2 = (u - mu) / sigma;
    let pVal = 1 - jStat.normal.cdf(z2, 0, 1);
    return { test: "Shapiro-Wilk", W: W, p: Math.max(0, Math.min(1, pVal)), n: n };
  }
}

/* ================================================================
 *  LEVENE'S TEST (for equality of variances)
 * ================================================================ */

export function levene(groups: number[][]): any {
  let k = groups.length;
  let N = 0;
  let ns: number[] = [];
  let groupMedians: number[] = [];
  for (let i = 0; i < k; i++) {
    ns.push(groups[i].length);
    N += groups[i].length;
    groupMedians.push(median(groups[i]));
  }

  let Z: number[][] = [];
  for (let i = 0; i < k; i++) {
    let zGroup: number[] = [];
    for (let j = 0; j < groups[i].length; j++) {
      zGroup.push(Math.abs(groups[i][j] - groupMedians[i]));
    }
    Z.push(zGroup);
  }

  let zMeans: number[] = [];
  let allZ: number[] = [];
  for (let i = 0; i < k; i++) {
    zMeans.push(mean(Z[i]));
    for (let j = 0; j < Z[i].length; j++) allZ.push(Z[i][j]);
  }
  let grandZMean = mean(allZ);

  let SSB = 0;
  for (let i = 0; i < k; i++) SSB += ns[i] * Math.pow(zMeans[i] - grandZMean, 2);

  let SSW = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < Z[i].length; j++) {
      SSW += Math.pow(Z[i][j] - zMeans[i], 2);
    }
  }

  let dfB = k - 1;
  let dfW = N - k;
  let F = (SSB / dfB) / (SSW / dfW);
  let p = 1 - jStat.centralF.cdf(F, dfB, dfW);

  return {
    test: "Levene's Test",
    F: F,
    dfBetween: dfB,
    dfWithin: dfW,
    p: p
  };
}

/* ================================================================
 *  PEARSON CORRELATION
 * ================================================================ */

export function pearson(x: number[], y: number[]): any {
  if (!x || !y || !x.length || !y.length) return { error: 'Arrays must be non-empty', valid: false };
  if (x.length !== y.length) return { error: "Arrays must be equal length", valid: false };
  let n = x.length;
  let mX = mean(x), mY = mean(y);
  let num = 0, dX = 0, dY = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mX) * (y[i] - mY);
    dX += (x[i] - mX) * (x[i] - mX);
    dY += (y[i] - mY) * (y[i] - mY);
  }
  let r = (dX === 0 || dY === 0) ? 0 : num / Math.sqrt(dX * dY);

  let df = n - 2;
  let t: number, p: number;
  if (Math.abs(r) >= 1) { t = Infinity; p = df > 0 ? 0 : 1; }
  else { t = r * Math.sqrt((n - 2) / (1 - r * r)); p = df > 0 ? 2 * (1 - jStat.studentt.cdf(Math.abs(t), df)) : 1; }

  let zr = 0.5 * Math.log((1 + r) / (1 - r));
  let seZ = n > 3 ? 1 / Math.sqrt(n - 3) : NaN;
  let ciLower: number, ciUpper: number;
  if (isNaN(seZ)) {
    ciLower = -1;
    ciUpper = 1;
  } else {
    let zLo = zr - 1.96 * seZ;
    let zHi = zr + 1.96 * seZ;
    ciLower = (Math.exp(2 * zLo) - 1) / (Math.exp(2 * zLo) + 1);
    ciUpper = (Math.exp(2 * zHi) - 1) / (Math.exp(2 * zHi) + 1);
  }

  return {
    test: "Pearson Correlation",
    r: r,
    rSquared: r * r,
    t: t,
    df: df,
    p: p,
    ci95: { lower: ciLower, upper: ciUpper },
    n: n
  };
}

/* ================================================================
 *  SPEARMAN RANK CORRELATION
 * ================================================================ */

export function spearman(x: number[], y: number[]): any {
  if (!x || !y || !x.length || !y.length) return { error: 'Arrays must be non-empty', valid: false };
  if (x.length !== y.length) return { error: "Arrays must be equal length", valid: false };
  let rx = rank(x);
  let ry = rank(y);
  let result = pearson(rx, ry);
  result.test = "Spearman Rank Correlation";
  result.rho = result.r;
  return result;
}

/* ================================================================
 *  POINT-BISERIAL CORRELATION
 * ================================================================ */

export function pointBiserial(binary: number[], continuous: number[]): any {
  if (!binary || !continuous || !binary.length || !continuous.length) return { error: 'Arrays must be non-empty', valid: false };
  if (binary.length !== continuous.length) return { error: "Arrays must be equal length", valid: false };
  let group0: number[] = [], group1: number[] = [];
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === 0) group0.push(continuous[i]);
    else group1.push(continuous[i]);
  }

  let n = binary.length;
  let n0 = group0.length, n1 = group1.length;
  let m0 = mean(group0), m1 = mean(group1);
  let sY = sd(continuous, 1);
  let rpb = sY === 0 ? 0 : ((m1 - m0) / sY) * Math.sqrt((n0 * n1) / (n * n));

  let t = rpb * Math.sqrt((n - 2) / (1 - rpb * rpb));
  let df = n - 2;
  let p = df > 0 ? 2 * (1 - jStat.studentt.cdf(Math.abs(t), df)) : 1;

  return {
    test: "Point-Biserial Correlation",
    r: rpb,
    t: t,
    df: df,
    p: p,
    mean0: m0,
    mean1: m1,
    n0: n0,
    n1: n1,
    n: n
  };
}

/* ================================================================
 *  CORRELATION MATRIX BUILDER
 * ================================================================ */

export function correlationMatrix(columns: number[][]): any {
  if (!columns || !columns.length) return { error: 'Columns must be non-empty', valid: false };
  let k = columns.length;
  let matrix: number[][] = [];
  let pMatrix: number[][] = [];
  for (let i = 0; i < k; i++) {
    matrix.push([]);
    pMatrix.push([]);
    for (let j = 0; j < k; j++) {
      if (i === j) {
        matrix[i].push(1);
        pMatrix[i].push(0);
      } else if (j < i) {
        matrix[i].push(matrix[j][i]);
        pMatrix[i].push(pMatrix[j][i]);
      } else {
        let res = pearson(columns[i], columns[j]);
        matrix[i].push(res.r);
        pMatrix[i].push(res.p);
      }
    }
  }
  return { r: matrix, p: pMatrix, k: k };
}

/* ================================================================
 *  SIMPLE / MULTIPLE LINEAR REGRESSION  (OLS)
 * ================================================================ */

export function linearRegression(y: number[], xs: any): any {
  if (xs.length > 0 && typeof xs[0] === "number") {
    xs = [xs];
  }

  let n = y.length;
  let p = xs.length;

  let X: number[][] = [];
  for (let i = 0; i < n; i++) {
    let row = [1];
    for (let j = 0; j < p; j++) row.push(xs[j][i]);
    X.push(row);
  }

  let cols = p + 1;

  let XtX: number[][] = [];
  for (let i = 0; i < cols; i++) {
    XtX.push([]);
    for (let j = 0; j < cols; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += X[k][i] * X[k][j];
      XtX[i].push(s);
    }
  }

  let Xty: number[] = [];
  for (let i = 0; i < cols; i++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += X[k][i] * y[k];
    Xty.push(s);
  }

  let betas = solveLinearSystem(XtX, Xty);
  if (!betas) return { test: "Linear Regression", error: "Singular matrix — cannot solve" };

  let yHat: number[] = [];
  let residuals: number[] = [];
  let yMean = mean(y);
  let SSR = 0, SSE = 0, SST = 0;
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j < cols; j++) pred += betas[j] * X[i][j];
    yHat.push(pred);
    residuals.push(y[i] - pred);
    SSR += Math.pow(pred - yMean, 2);
    SSE += Math.pow(y[i] - pred, 2);
    SST += Math.pow(y[i] - yMean, 2);
  }

  let R2 = SST === 0 ? 0 : 1 - SSE / SST;
  let adjR2 = 1 - ((1 - R2) * (n - 1)) / (n - cols);
  let MSE = SSE / (n - cols);
  let RMSE = Math.sqrt(MSE);

  let MSR = SSR / p;
  let F = MSR / MSE;
  let fP = 1 - jStat.centralF.cdf(F, p, n - cols);

  let XtXinv = invertMatrix(XtX);
  let seBetas: number[] = [];
  let tStats: number[] = [];
  let pValues: number[] = [];
  if (XtXinv) {
    for (let j = 0; j < cols; j++) {
      let sej = Math.sqrt(MSE * XtXinv[j][j]);
      seBetas.push(sej);
      let tj = betas[j] / sej;
      tStats.push(tj);
      pValues.push(2 * (1 - jStat.studentt.cdf(Math.abs(tj), n - cols)));
    }
  }

  let dw = 0;
  for (let i = 1; i < n; i++) dw += Math.pow(residuals[i] - residuals[i - 1], 2);
  let ssRes = 0;
  for (let i = 0; i < n; i++) ssRes += residuals[i] * residuals[i];
  dw = ssRes > 0 ? dw / ssRes : 0;

  return {
    test: "Linear Regression (OLS)",
    coefficients: betas, se: seBetas, tStats: tStats, pValues: pValues,
    R2: R2, adjR2: adjR2, F: F, fP: fP,
    SSR: SSR, SSE: SSE, SST: SST, MSE: MSE, RMSE: RMSE,
    residuals: residuals, predicted: yHat, durbinWatson: dw, n: n, p: p
  };
}

/* ================================================================
 *  LOGISTIC REGRESSION  (IRLS)
 * ================================================================ */

export function logisticRegression(y: number[], xs: any, options?: any): any {
  if (!options) options = {};
  let maxIter = options.maxIter || 25;
  let tol = options.tol || 1e-8;

  if (xs.length > 0 && typeof xs[0] === "number") { xs = [xs]; }

  let n = y.length;
  let p = xs.length;
  let cols = p + 1;

  let X: number[][] = [];
  for (let i = 0; i < n; i++) {
    let row = [1];
    for (let j = 0; j < p; j++) row.push(xs[j][i]);
    X.push(row);
  }

  let beta = new Array(cols);
  for (let j = 0; j < cols; j++) beta[j] = 0;

  function sigmoid(z: number): number { return 1 / (1 + Math.exp(-z)); }

  let converged = false;
  let iter: number = 0;

  for (iter = 0; iter < maxIter; iter++) {
    let mu: number[] = [];
    for (let i = 0; i < n; i++) {
      let z = 0;
      for (let j = 0; j < cols; j++) z += beta[j] * X[i][j];
      mu.push(sigmoid(z));
    }

    let W: number[] = [];
    for (let i = 0; i < n; i++) {
      W.push(mu[i] * (1 - mu[i]));
      if (W[i] < 1e-10) W[i] = 1e-10;
    }

    let XtWX: number[][] = [];
    for (let a = 0; a < cols; a++) {
      XtWX.push([]);
      for (let b = 0; b < cols; b++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += X[i][a] * W[i] * X[i][b];
        XtWX[a].push(s);
      }
    }

    let score: number[] = [];
    for (let a = 0; a < cols; a++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += X[i][a] * (y[i] - mu[i]);
      score.push(s);
    }

    let delta = solveLinearSystem(XtWX, score);
    if (!delta) break;

    let maxDelta = 0;
    for (let j = 0; j < cols; j++) {
      beta[j] += delta[j];
      if (Math.abs(delta[j]) > maxDelta) maxDelta = Math.abs(delta[j]);
    }

    if (maxDelta < tol) { converged = true; break; }
  }

  let predicted: number[] = [];
  let logLik = 0;
  for (let i = 0; i < n; i++) {
    let z = 0;
    for (let j = 0; j < cols; j++) z += beta[j] * X[i][j];
    let pr = sigmoid(z);
    predicted.push(pr);
    logLik += y[i] * Math.log(pr + 1e-15) + (1 - y[i]) * Math.log(1 - pr + 1e-15);
  }

  let pBar = mean(y);
  let logLikNull = 0;
  for (let i = 0; i < n; i++) {
    logLikNull += y[i] * Math.log(pBar + 1e-15) + (1 - y[i]) * Math.log(1 - pBar + 1e-15);
  }

  let deviance = -2 * logLik;
  let nullDeviance = -2 * logLikNull;
  let pseudoR2 = 1 - logLik / logLikNull;

  let oddsRatios = beta.map(function (b: number) { return Math.exp(b); });

  let mu2: number[] = [];
  for (let i = 0; i < n; i++) {
    let z = 0;
    for (let j = 0; j < cols; j++) z += beta[j] * X[i][j];
    mu2.push(sigmoid(z));
  }
  let W2 = mu2.map(function (m: number) { return Math.max(m * (1 - m), 1e-10); });
  let H: number[][] = [];
  for (let a = 0; a < cols; a++) {
    H.push([]);
    for (let b = 0; b < cols; b++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += X[i][a] * W2[i] * X[i][b];
      H[a].push(s);
    }
  }
  let Hinv = invertMatrix(H);
  let seBetas: number[] = [];
  let zStats: number[] = [];
  let pValues: number[] = [];
  if (Hinv) {
    for (let j = 0; j < cols; j++) {
      let sej = Math.sqrt(Math.abs(Hinv[j][j]));
      seBetas.push(sej);
      let zj = beta[j] / sej;
      zStats.push(zj);
      pValues.push(2 * (1 - jStat.normal.cdf(Math.abs(zj), 0, 1)));
    }
  }

  let AIC = -2 * logLik + 2 * cols;
  let BIC = -2 * logLik + Math.log(n) * cols;

  return {
    test: "Logistic Regression (IRLS)",
    coefficients: beta, se: seBetas, zStats: zStats, pValues: pValues,
    oddsRatios: oddsRatios, logLikelihood: logLik, nullLogLikelihood: logLikNull,
    deviance: deviance, nullDeviance: nullDeviance, pseudoR2: pseudoR2,
    AIC: AIC, BIC: BIC, predicted: predicted, converged: converged,
    iterations: iter + 1, n: n, p: p
  };
}

/* ================================================================
 *  CRONBACH'S ALPHA
 * ================================================================ */

export function cronbachAlpha(items: number[][]): any {
  let k = items.length;
  let n = items[0].length;

  let totals: number[] = [];
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (let j = 0; j < k; j++) t += items[j][i];
    totals.push(t);
  }

  let varTotal = variance(totals, 1);
  let sumItemVar = 0;
  for (let j = 0; j < k; j++) sumItemVar += variance(items[j], 1);

  let alpha = (k / (k - 1)) * (1 - sumItemVar / varTotal);

  let itemTotalCorrs: number[] = [];
  let alphaIfDeleted: number[] = [];
  for (let j = 0; j < k; j++) {
    let correctedTotals: number[] = [];
    for (let i = 0; i < n; i++) correctedTotals.push(totals[i] - items[j][i]);
    let r = pearson(items[j], correctedTotals).r;
    itemTotalCorrs.push(r);

    let remainingItems: number[][] = [];
    for (let m = 0; m < k; m++) {
      if (m !== j) remainingItems.push(items[m]);
    }
    if (remainingItems.length > 1) {
      let totDel: number[] = [];
      for (let i = 0; i < n; i++) {
        let t = 0;
        for (let m = 0; m < remainingItems.length; m++) t += remainingItems[m][i];
        totDel.push(t);
      }
      let varTotDel = variance(totDel, 1);
      let sumVarDel = 0;
      for (let m = 0; m < remainingItems.length; m++) sumVarDel += variance(remainingItems[m], 1);
      let kDel = remainingItems.length;
      alphaIfDeleted.push((kDel / (kDel - 1)) * (1 - sumVarDel / varTotDel));
    } else {
      alphaIfDeleted.push(NaN);
    }
  }

  return {
    test: "Cronbach's Alpha", alpha: alpha, k: k, n: n,
    itemTotalCorrelations: itemTotalCorrs, alphaIfDeleted: alphaIfDeleted,
    sumItemVariance: sumItemVar, totalVariance: varTotal
  };
}

/* ================================================================
 *  COHEN'S KAPPA
 * ================================================================ */

export function cohensKappa(rater1: any[], rater2: any[]): any {
  if (!rater1 || !rater2 || !rater1.length || !rater2.length) return { error: 'Arrays must be non-empty', valid: false };
  if (rater1.length !== rater2.length) return { error: "Rater arrays must be equal length", valid: false };
  let n = rater1.length;

  let catSet: Record<string, boolean> = {};
  for (let i = 0; i < n; i++) {
    catSet[String(rater1[i])] = true;
    catSet[String(rater2[i])] = true;
  }
  let categories = Object.keys(catSet).sort();
  let k = categories.length;

  let matrix: number[][] = [];
  for (let i = 0; i < k; i++) {
    matrix.push([]);
    for (let j = 0; j < k; j++) matrix[i].push(0);
  }
  for (let i = 0; i < n; i++) {
    let ri = categories.indexOf(String(rater1[i]));
    let ci = categories.indexOf(String(rater2[i]));
    matrix[ri][ci]++;
  }

  let agreed = 0;
  for (let i = 0; i < k; i++) agreed += matrix[i][i];
  let po = agreed / n;

  let pe = 0;
  for (let cat = 0; cat < k; cat++) {
    let rowSum = 0;
    let colSum = 0;
    for (let j = 0; j < k; j++) {
      rowSum += matrix[cat][j];
      colSum += matrix[j][cat];
    }
    pe += (rowSum / n) * (colSum / n);
  }

  let kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
  let seKappa = pe === 1 ? 0 : Math.sqrt(pe / (n * (1 - pe)));
  let z = seKappa === 0 ? 0 : kappa / seKappa;
  let p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
  let ciLower = kappa - 1.96 * seKappa;
  let ciUpper = kappa + 1.96 * seKappa;

  return {
    test: "Cohen's Kappa", kappa: kappa, p: p, se: seKappa,
    ci95: { lower: ciLower, upper: ciUpper },
    observedAgreement: po, expectedAgreement: pe, n: n, categories: categories, z: z
  };
}
