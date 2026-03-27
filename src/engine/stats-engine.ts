/**
 * Market Research Statistics Toolkit — Stats Engine (v2 TypeScript)
 * Migrated from v1 stats-engine.js — logic preserved verbatim.
 *
 * RULES:
 * - Zero imports from React, Zustand, DOM, or window
 * - Pure computation only — no side effects
 * - All functions are named exports
 */

// @ts-nocheck
// Rationale: The v1 engine is 6,800 lines of battle-tested JS with implicit typing.
// ts-nocheck will be removed incrementally as types are added per-function.

import jStat from 'jstat'

  /* ================================================================
   *  INTERNAL HELPERS  (math / rank / percentile / etc.)
   * ================================================================ */

  function sum(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s;
  }

  function mean(arr) {
    return arr.length === 0 ? NaN : sum(arr) / arr.length;
  }

  function variance(arr, ddof) {
    if (ddof === undefined) ddof = 1;
    var m = mean(arr);
    var ss = 0;
    for (var i = 0; i < arr.length; i++) ss += (arr[i] - m) * (arr[i] - m);
    return ss / (arr.length - ddof);
  }

  function sd(arr, ddof) {
    return Math.sqrt(variance(arr, ddof));
  }

  function median(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function mode(arr) {
    var freq = {};
    var maxF = 0;
    var modes = [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      freq[v] = (freq[v] || 0) + 1;
      if (freq[v] > maxF) maxF = freq[v];
    }
    for (var key in freq) {
      if (freq[key] === maxF) modes.push(Number(key));
    }
    return modes.length === arr.length ? [] : modes;
  }

  function percentile(arr, p) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var idx = (p / 100) * (s.length - 1);
    var lo = Math.floor(idx);
    var hi = Math.ceil(idx);
    if (lo === hi) return s[lo];
    return s[lo] + (idx - lo) * (s[hi] - s[lo]);
  }

  function iqr(arr) {
    return percentile(arr, 75) - percentile(arr, 25);
  }

  function skewness(arr) {
    var n = arr.length;
    var m = mean(arr);
    var s = sd(arr, 1);
    if (s === 0 || n < 3) return 0;
    var s3 = 0;
    for (var i = 0; i < n; i++) s3 += Math.pow((arr[i] - m) / s, 3);
    return (n / ((n - 1) * (n - 2))) * s3;
  }

  function kurtosis(arr) {
    var n = arr.length;
    var m = mean(arr);
    var s = sd(arr, 1);
    if (s === 0 || n < 4) return 0;
    var s4 = 0;
    for (var i = 0; i < n; i++) s4 += Math.pow((arr[i] - m) / s, 4);
    var k = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * s4;
    k -= (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
    return k; // excess kurtosis
  }

  function rank(arr) {
    var indexed = arr.map(function (v, i) { return { v: v, i: i }; });
    indexed.sort(function (a, b) { return a.v - b.v; });
    var ranks = new Array(arr.length);
    var i = 0;
    while (i < indexed.length) {
      var j = i;
      while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
      var avgRank = (i + 1 + j) / 2;
      for (var k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
      i = j;
    }
    return ranks;
  }

  function confidenceInterval(arr, confidence) {
    if (confidence === undefined) confidence = 0.95;
    var n = arr.length;
    var m = mean(arr);
    var se = sd(arr, 1) / Math.sqrt(n);
    var alpha = 1 - confidence;
    var tCrit = jStat.studentt.inv(1 - alpha / 2, n - 1);
    return { lower: m - tCrit * se, upper: m + tCrit * se, mean: m, se: se };
  }

  function factorial(n) {
    if (n <= 1) return 1;
    var r = 1;
    for (var i = 2; i <= n; i++) r *= i;
    return r;
  }

  function choose(n, k) {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;
    return factorial(n) / (factorial(k) * factorial(n - k));
  }

  /* ================================================================
   *  detectType  — auto-detect variable type from values
   * ================================================================ */

  function detectType(values) {
    if (!values || values.length === 0) return "empty";

    var nonNull = values.filter(function (v) { return v !== null && v !== undefined && v !== ""; });
    if (nonNull.length === 0) return "empty";

    var numCount = 0;
    var unique = {};
    for (var i = 0; i < nonNull.length; i++) {
      var v = nonNull[i];
      if (typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && v.trim() !== "")) {
        numCount++;
      }
      unique[String(v)] = true;
    }

    var numRatio = numCount / nonNull.length;
    var uniqueCount = Object.keys(unique).length;

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

  function describe(values) {
    if (!values || !values.length) return { error: 'Values must be non-empty', valid: false };
    var nums = values
      .map(function (v) { return typeof v === "number" ? v : Number(v); })
      .filter(function (v) { return !isNaN(v); });

    if (nums.length === 0) {
      return { n: 0, mean: NaN, median: NaN, mode: [], sd: NaN, variance: NaN, min: NaN, max: NaN, range: NaN, iqr: NaN, skewness: NaN, kurtosis: NaN, p25: NaN, p50: NaN, p75: NaN, p5: NaN, p95: NaN, ci95: null, se: NaN };
    }

    var sorted = nums.slice().sort(function (a, b) { return a - b; });
    var ci = confidenceInterval(nums);

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

  function ttest(a, b) {
    var nA = a.length, nB = b.length;
    var mA = mean(a), mB = mean(b);
    var vA = variance(a, 1), vB = variance(b, 1);
    var se = Math.sqrt(vA / nA + vB / nB);
    var t = (mA - mB) / se;

    // Welch-Satterthwaite df
    var num = Math.pow(vA / nA + vB / nB, 2);
    var den = Math.pow(vA / nA, 2) / (nA - 1) + Math.pow(vB / nB, 2) / (nB - 1);
    var df = num / den;

    var p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

    // Cohen's d (pooled SD)
    var pooledSD = Math.sqrt(((nA - 1) * vA + (nB - 1) * vB) / (nA + nB - 2));
    var cohensD = pooledSD === 0 ? 0 : (mA - mB) / pooledSD;

    // 95% CI for the difference
    var tCrit = jStat.studentt.inv(0.975, df);
    var ciLower = (mA - mB) - tCrit * se;
    var ciUpper = (mA - mB) + tCrit * se;

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

  function pairedTTest(a, b) {
    if (!a || !b || !a.length || !b.length) return { error: 'Arrays must be non-empty', valid: false };
    if (a.length !== b.length) return { error: "Paired t-test requires equal-length arrays", valid: false };
    var n = a.length;
    var diffs = [];
    for (var i = 0; i < n; i++) diffs.push(a[i] - b[i]);
    var mD = mean(diffs);
    var sD = sd(diffs, 1);
    var se = sD / Math.sqrt(n);
    var t = mD / se;
    var df = n - 1;
    var p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

    var tCrit = jStat.studentt.inv(0.975, df);
    var cohensD = sD === 0 ? 0 : mD / sD;

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

  function anova(groups) {
    var k = groups.length;
    var allVals = [];
    var ns = [];
    var means = [];
    for (var i = 0; i < k; i++) {
      ns.push(groups[i].length);
      means.push(mean(groups[i]));
      for (var j = 0; j < groups[i].length; j++) allVals.push(groups[i][j]);
    }
    var grandMean = mean(allVals);
    var N = allVals.length;

    // Sum of squares
    var SSB = 0;
    for (var i = 0; i < k; i++) SSB += ns[i] * Math.pow(means[i] - grandMean, 2);

    var SSW = 0;
    for (var i = 0; i < k; i++) {
      for (var j = 0; j < groups[i].length; j++) {
        SSW += Math.pow(groups[i][j] - means[i], 2);
      }
    }

    var SST = SSB + SSW;
    var dfBetween = k - 1;
    var dfWithin = N - k;
    var MSB = SSB / dfBetween;
    var MSW = SSW / dfWithin;
    var F = MSB / MSW;
    var p = 1 - jStat.centralF.cdf(F, dfBetween, dfWithin);
    var etaSquared = SSB / SST;

    // Post-hoc pairwise comparisons (Bonferroni-corrected t-tests)
    var posthoc = [];
    var numComparisons = k * (k - 1) / 2;
    for (var i = 0; i < k; i++) {
      for (var j = i + 1; j < k; j++) {
        var res = ttest(groups[i], groups[j]);
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

  function mannWhitney(a, b) {
    var nA = a.length, nB = b.length;
    var combined = [];
    for (var i = 0; i < nA; i++) combined.push({ v: a[i], g: 0 });
    for (var i = 0; i < nB; i++) combined.push({ v: b[i], g: 1 });

    // Rank all values
    var vals = combined.map(function (x) { return x.v; });
    var ranks = rank(vals);

    var R1 = 0, R2 = 0;
    for (var i = 0; i < combined.length; i++) {
      if (combined[i].g === 0) R1 += ranks[i];
      else R2 += ranks[i];
    }

    var U1 = R1 - nA * (nA + 1) / 2;
    var U2 = R2 - nB * (nB + 1) / 2;
    var U = Math.min(U1, U2);

    // Normal approximation (with continuity correction)
    var mU = nA * nB / 2;
    // Tie correction: count tie groups from ranks
    var N = nA + nB;
    var tieCorr = 0;
    var ri = 0;
    var sortedRanks = ranks.slice().sort(function (a, b) { return a - b; });
    while (ri < sortedRanks.length) {
      var rj = ri;
      while (rj < sortedRanks.length && sortedRanks[rj] === sortedRanks[ri]) rj++;
      var t = rj - ri;
      if (t > 1) tieCorr += (t * t * t - t);
      ri = rj;
    }
    var sigmaU = Math.sqrt((nA * nB / 12) * ((N + 1) - tieCorr / (N * (N - 1))));
    var z = (U - mU) / sigmaU;
    var p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));

    // Effect size r = z / sqrt(N)
    var r = z / Math.sqrt(nA + nB);

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

  function wilcoxon(a, b) {
    if (!a || !b || !a.length || !b.length) return { error: 'Arrays must be non-empty', valid: false };
    if (a.length !== b.length) return { error: "Wilcoxon requires equal-length arrays", valid: false };
    var n = a.length;
    var diffs = [];
    for (var i = 0; i < n; i++) {
      var d = a[i] - b[i];
      if (d !== 0) diffs.push(d);
    }

    var nr = diffs.length; // non-zero pairs
    var absDiffs = diffs.map(Math.abs);
    var ranks_arr = rank(absDiffs);

    var Wplus = 0, Wminus = 0;
    for (var i = 0; i < nr; i++) {
      if (diffs[i] > 0) Wplus += ranks_arr[i];
      else Wminus += ranks_arr[i];
    }

    var W = Math.min(Wplus, Wminus);

    // Normal approximation with tie correction
    var mW = nr * (nr + 1) / 4;
    var tieCorrW = 0;
    var sri = 0;
    var sortedAbsRanks = ranks_arr.slice().sort(function (a, b) { return a - b; });
    while (sri < sortedAbsRanks.length) {
      var srj = sri;
      while (srj < sortedAbsRanks.length && sortedAbsRanks[srj] === sortedAbsRanks[sri]) srj++;
      var tw = srj - sri;
      if (tw > 1) tieCorrW += (tw * tw * tw - tw);
      sri = srj;
    }
    var sigmaW = Math.sqrt((nr * (nr + 1) * (2 * nr + 1) - tieCorrW / 2) / 24);
    var z = sigmaW === 0 ? 0 : (W - mW) / sigmaW;
    var p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
    var r = nr > 0 ? Math.abs(z) / Math.sqrt(nr) : 0;

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

  function kruskalWallis(groups) {
    var k = groups.length;
    var combined = [];
    var ns = [];
    for (var i = 0; i < k; i++) {
      ns.push(groups[i].length);
      for (var j = 0; j < groups[i].length; j++) {
        combined.push({ v: groups[i][j], g: i });
      }
    }
    var N = combined.length;
    var vals = combined.map(function (x) { return x.v; });
    var ranks_arr = rank(vals);

    var rankSums = new Array(k);
    for (var i = 0; i < k; i++) rankSums[i] = 0;
    for (var i = 0; i < combined.length; i++) {
      rankSums[combined[i].g] += ranks_arr[i];
    }

    var meanRanks = rankSums.map(function (r, i) { return r / ns[i]; });

    // H statistic
    var H = 0;
    for (var i = 0; i < k; i++) {
      H += (rankSums[i] * rankSums[i]) / ns[i];
    }
    H = (12 / (N * (N + 1))) * H - 3 * (N + 1);

    // Tie correction for Kruskal-Wallis
    var tieCorrKW = 0;
    var ki = 0;
    var sortedKWRanks = ranks_arr.slice().sort(function (a, b) { return a - b; });
    while (ki < sortedKWRanks.length) {
      var kj = ki;
      while (kj < sortedKWRanks.length && sortedKWRanks[kj] === sortedKWRanks[ki]) kj++;
      var tk = kj - ki;
      if (tk > 1) tieCorrKW += (tk * tk * tk - tk);
      ki = kj;
    }
    var tieDenom = 1 - tieCorrKW / (N * N * N - N);
    if (tieDenom > 0) H = H / tieDenom;

    var df = k - 1;
    var p = 1 - jStat.chisquare.cdf(H, df);

    // Eta-squared approximation
    var etaH = (H - k + 1) / (N - k);

    // Post-hoc: Dunn's test (Bonferroni)
    var posthoc = [];
    var numComparisons = k * (k - 1) / 2;
    for (var i = 0; i < k; i++) {
      for (var j = i + 1; j < k; j++) {
        var seDunn = Math.sqrt((N * (N + 1) / 12) * (1 / ns[i] + 1 / ns[j]));
        var zDunn = (meanRanks[i] - meanRanks[j]) / seDunn;
        var pDunn = 2 * (1 - jStat.normal.cdf(Math.abs(zDunn), 0, 1));
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

  function chiSquare(observed) {
    var nRows = observed.length;
    var nCols = observed[0].length;
    var N = 0;
    var rowTotals = [];
    var colTotals = new Array(nCols);
    for (var c = 0; c < nCols; c++) colTotals[c] = 0;

    for (var r = 0; r < nRows; r++) {
      var rt = 0;
      for (var c = 0; c < nCols; c++) {
        rt += observed[r][c];
        colTotals[c] += observed[r][c];
        N += observed[r][c];
      }
      rowTotals.push(rt);
    }

    // Expected frequencies
    var expected = [];
    var chi2 = 0;
    var anySmallExpected = false;
    for (var r = 0; r < nRows; r++) {
      expected.push([]);
      for (var c = 0; c < nCols; c++) {
        var e = (rowTotals[r] * colTotals[c]) / N;
        expected[r].push(e);
        if (e < 5) anySmallExpected = true;
        chi2 += Math.pow(observed[r][c] - e, 2) / e;
      }
    }

    var df = (nRows - 1) * (nCols - 1);
    var p = 1 - jStat.chisquare.cdf(chi2, df);

    // Cramer's V
    var minDim = Math.min(nRows, nCols) - 1;
    var cramersV = minDim > 0 ? Math.sqrt(chi2 / (N * minDim)) : 0;

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

  function lnFactorial(n) { return jStat.gammaln(n + 1); }
  function lnChoose(n, k) { return lnFactorial(n) - lnFactorial(k) - lnFactorial(n - k); }

  function fisherExact(a, b, c, d) {
    // 2x2 table:  [[a, b], [c, d]]
    var n = a + b + c + d;
    var r1 = a + b, r2 = c + d;
    var c1 = a + c, c2 = b + d;

    function lnHypergeomPMF(x, N, K, nn) {
      return lnChoose(K, x) + lnChoose(N - K, nn - x) - lnChoose(N, nn);
    }

    var lnPObserved = lnHypergeomPMF(a, n, c1, r1);
    var pValue = 0;

    var minA = Math.max(0, r1 - c2);
    var maxA = Math.min(r1, c1);
    for (var x = minA; x <= maxA; x++) {
      var lnPx = lnHypergeomPMF(x, n, c1, r1);
      if (lnPx <= lnPObserved + 1e-10) pValue += Math.exp(lnPx);
    }

    // Odds ratio
    var oddsRatio = (b === 0 || c === 0) ? Infinity : (a * d) / (b * c);

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

  function mcnemar(a, b, c, d) {
    // 2x2 paired table: [[a,b],[c,d]]
    // b = discordant: +/-, c = discordant: -/+
    var chi2 = (b + c) > 0 ? Math.pow(Math.abs(b - c) - 1, 2) / (b + c) : 0; // continuity correction
    var df = 1;
    var p = 1 - jStat.chisquare.cdf(chi2, df);

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

  function twoProportionZ(x1, n1, x2, n2) {
    var p1 = x1 / n1;
    var p2 = x2 / n2;
    var pPool = (x1 + x2) / (n1 + n2);
    var se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
    var z = se === 0 ? 0 : (p1 - p2) / se;
    var p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));

    var seDiff = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
    var zCrit = 1.96;

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

  function shapiroWilk(x) {
    var n = x.length;
    if (n < 3 || n > 5000) return { test: "Shapiro-Wilk", W: NaN, p: NaN, warning: "n must be between 3 and 5000" };

    var sorted = x.slice().sort(function (a, b) { return a - b; });
    var m = mean(sorted);

    // Approximate coefficients using Royston's method
    var s2 = 0;
    for (var i = 0; i < n; i++) s2 += (sorted[i] - m) * (sorted[i] - m);

    // Expected normal order statistics (approximation)
    var mtilde = [];
    for (var i = 0; i < n; i++) {
      var p_i = (i + 1 - 0.375) / (n + 0.25);
      mtilde.push(jStat.normal.inv(p_i, 0, 1));
    }

    // m* norm
    var mNorm = 0;
    for (var i = 0; i < n; i++) mNorm += mtilde[i] * mtilde[i];
    mNorm = Math.sqrt(mNorm);

    // Coefficients a_i
    var a = mtilde.map(function (v) { return v / mNorm; });

    // W statistic
    var num2 = 0;
    for (var i = 0; i < n; i++) num2 += a[i] * sorted[i];
    num2 = num2 * num2;

    var W = num2 / s2;

    // P-value approximation via Royston (1992) transformation
    var mu, sigma, gamma2;
    var lnN = Math.log(n);

    if (n <= 11) {
      gamma2 = -2.273 + 0.459 * n;
      mu = 0.544 - 0.39978 * n + 0.025054 * n * n - 0.0006714 * n * n * n;
      sigma = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n * n - 0.0020322 * n * n * n);
      var z2 = (-Math.log(gamma2 - Math.log(1 - W)) - mu) / sigma;
      var pVal = 1 - jStat.normal.cdf(z2, 0, 1);
      return { test: "Shapiro-Wilk", W: W, p: Math.max(0, Math.min(1, pVal)), n: n };
    } else {
      // Royston 1995 approximation for n > 11
      // Transform: u = ln(1-W), then normalize
      var u = Math.log(1 - W);
      mu = 0.0038915 * Math.pow(lnN, 3) - 0.083751 * Math.pow(lnN, 2) - 0.31082 * lnN - 1.5861;
      sigma = Math.exp(0.0030302 * Math.pow(lnN, 2) - 0.082676 * lnN - 0.4803);
      var z2 = (u - mu) / sigma;
      // High z = non-normal (W far from 1), so p = 1 - Phi(z)
      var pVal = 1 - jStat.normal.cdf(z2, 0, 1);
      return { test: "Shapiro-Wilk", W: W, p: Math.max(0, Math.min(1, pVal)), n: n };
    }
  }

  /* ================================================================
   *  LEVENE'S TEST (for equality of variances)
   * ================================================================ */

  function levene(groups) {
    var k = groups.length;
    var N = 0;
    var ns = [];
    var groupMedians = [];
    for (var i = 0; i < k; i++) {
      ns.push(groups[i].length);
      N += groups[i].length;
      groupMedians.push(median(groups[i]));
    }

    // Deviation scores from group medians
    var Z = [];
    for (var i = 0; i < k; i++) {
      var zGroup = [];
      for (var j = 0; j < groups[i].length; j++) {
        zGroup.push(Math.abs(groups[i][j] - groupMedians[i]));
      }
      Z.push(zGroup);
    }

    // Now run ANOVA on the Z scores
    var zMeans = [];
    var allZ = [];
    for (var i = 0; i < k; i++) {
      zMeans.push(mean(Z[i]));
      for (var j = 0; j < Z[i].length; j++) allZ.push(Z[i][j]);
    }
    var grandZMean = mean(allZ);

    var SSB = 0;
    for (var i = 0; i < k; i++) SSB += ns[i] * Math.pow(zMeans[i] - grandZMean, 2);

    var SSW = 0;
    for (var i = 0; i < k; i++) {
      for (var j = 0; j < Z[i].length; j++) {
        SSW += Math.pow(Z[i][j] - zMeans[i], 2);
      }
    }

    var dfB = k - 1;
    var dfW = N - k;
    var F = (SSB / dfB) / (SSW / dfW);
    var p = 1 - jStat.centralF.cdf(F, dfB, dfW);

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

  function pearson(x, y) {
    if (!x || !y || !x.length || !y.length) return { error: 'Arrays must be non-empty', valid: false };
    if (x.length !== y.length) return { error: "Arrays must be equal length", valid: false };
    var n = x.length;
    var mX = mean(x), mY = mean(y);
    var num = 0, dX = 0, dY = 0;
    for (var i = 0; i < n; i++) {
      num += (x[i] - mX) * (y[i] - mY);
      dX += (x[i] - mX) * (x[i] - mX);
      dY += (y[i] - mY) * (y[i] - mY);
    }
    var r = (dX === 0 || dY === 0) ? 0 : num / Math.sqrt(dX * dY);

    // t-test for significance (guard r = ±1 where 1-r*r = 0)
    var df = n - 2;
    var t, p;
    if (Math.abs(r) >= 1) { t = Infinity; p = df > 0 ? 0 : 1; }
    else { t = r * Math.sqrt((n - 2) / (1 - r * r)); p = df > 0 ? 2 * (1 - jStat.studentt.cdf(Math.abs(t), df)) : 1; }

    // Fisher Z transform for CI
    var zr = 0.5 * Math.log((1 + r) / (1 - r));
    var seZ = n > 3 ? 1 / Math.sqrt(n - 3) : NaN;
    var ciLower, ciUpper;
    if (isNaN(seZ)) {
      ciLower = -1;
      ciUpper = 1;
    } else {
      var zLo = zr - 1.96 * seZ;
      var zHi = zr + 1.96 * seZ;
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

  function spearman(x, y) {
    if (!x || !y || !x.length || !y.length) return { error: 'Arrays must be non-empty', valid: false };
    if (x.length !== y.length) return { error: "Arrays must be equal length", valid: false };
    var rx = rank(x);
    var ry = rank(y);
    var result = pearson(rx, ry);
    result.test = "Spearman Rank Correlation";
    result.rho = result.r;
    return result;
  }

  /* ================================================================
   *  POINT-BISERIAL CORRELATION
   * ================================================================ */

  function pointBiserial(binary, continuous) {
    if (!binary || !continuous || !binary.length || !continuous.length) return { error: 'Arrays must be non-empty', valid: false };
    if (binary.length !== continuous.length) return { error: "Arrays must be equal length", valid: false };
    var group0 = [], group1 = [];
    for (var i = 0; i < binary.length; i++) {
      if (binary[i] === 0) group0.push(continuous[i]);
      else group1.push(continuous[i]);
    }

    var n = binary.length;
    var n0 = group0.length, n1 = group1.length;
    var m0 = mean(group0), m1 = mean(group1);
    var sY = sd(continuous, 1);
    var rpb = sY === 0 ? 0 : ((m1 - m0) / sY) * Math.sqrt((n0 * n1) / (n * n));

    var t = rpb * Math.sqrt((n - 2) / (1 - rpb * rpb));
    var df = n - 2;
    var p = df > 0 ? 2 * (1 - jStat.studentt.cdf(Math.abs(t), df)) : 1;

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

  function correlationMatrix(columns) {
    if (!columns || !columns.length) return { error: 'Columns must be non-empty', valid: false };
    var k = columns.length;
    var matrix = [];
    var pMatrix = [];
    for (var i = 0; i < k; i++) {
      matrix.push([]);
      pMatrix.push([]);
      for (var j = 0; j < k; j++) {
        if (i === j) {
          matrix[i].push(1);
          pMatrix[i].push(0);
        } else if (j < i) {
          matrix[i].push(matrix[j][i]);
          pMatrix[i].push(pMatrix[j][i]);
        } else {
          var res = pearson(columns[i], columns[j]);
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

  function linearRegression(y, xs) {
    // xs: array of arrays (predictors). Each xs[j] is a column.
    // If xs is a 1D array, treat as single predictor.
    if (xs.length > 0 && typeof xs[0] === "number") {
      xs = [xs];
    }

    var n = y.length;
    var p = xs.length; // number of predictors

    // Build design matrix X with intercept column
    var X = [];
    for (var i = 0; i < n; i++) {
      var row = [1]; // intercept
      for (var j = 0; j < p; j++) row.push(xs[j][i]);
      X.push(row);
    }

    var cols = p + 1; // including intercept

    // X'X
    var XtX = [];
    for (var i = 0; i < cols; i++) {
      XtX.push([]);
      for (var j = 0; j < cols; j++) {
        var s = 0;
        for (var k = 0; k < n; k++) s += X[k][i] * X[k][j];
        XtX[i].push(s);
      }
    }

    // X'y
    var Xty = [];
    for (var i = 0; i < cols; i++) {
      var s = 0;
      for (var k = 0; k < n; k++) s += X[k][i] * y[k];
      Xty.push(s);
    }

    // Solve via Gauss-Jordan elimination
    var betas = solveLinearSystem(XtX, Xty);
    if (!betas) return { test: "Linear Regression", error: "Singular matrix — cannot solve" };

    // Predictions and residuals
    var yHat = [];
    var residuals = [];
    var yMean = mean(y);
    var SSR = 0, SSE = 0, SST = 0;
    for (var i = 0; i < n; i++) {
      var pred = 0;
      for (var j = 0; j < cols; j++) pred += betas[j] * X[i][j];
      yHat.push(pred);
      residuals.push(y[i] - pred);
      SSR += Math.pow(pred - yMean, 2);
      SSE += Math.pow(y[i] - pred, 2);
      SST += Math.pow(y[i] - yMean, 2);
    }

    var R2 = SST === 0 ? 0 : 1 - SSE / SST;
    var adjR2 = 1 - ((1 - R2) * (n - 1)) / (n - cols);
    var MSE = SSE / (n - cols);
    var RMSE = Math.sqrt(MSE);

    // F-test for model
    var MSR = SSR / p;
    var F = MSR / MSE;
    var fP = 1 - jStat.centralF.cdf(F, p, n - cols);

    // Standard errors for coefficients
    var XtXinv = invertMatrix(XtX);
    var seBetas = [];
    var tStats = [];
    var pValues = [];
    if (XtXinv) {
      for (var j = 0; j < cols; j++) {
        var sej = Math.sqrt(MSE * XtXinv[j][j]);
        seBetas.push(sej);
        var tj = betas[j] / sej;
        tStats.push(tj);
        pValues.push(2 * (1 - jStat.studentt.cdf(Math.abs(tj), n - cols)));
      }
    }

    // Durbin-Watson
    var dw = 0;
    for (var i = 1; i < n; i++) dw += Math.pow(residuals[i] - residuals[i - 1], 2);
    var ssRes = 0;
    for (var i = 0; i < n; i++) ssRes += residuals[i] * residuals[i];
    dw = ssRes > 0 ? dw / ssRes : 0;

    return {
      test: "Linear Regression (OLS)",
      coefficients: betas,
      se: seBetas,
      tStats: tStats,
      pValues: pValues,
      R2: R2,
      adjR2: adjR2,
      F: F,
      fP: fP,
      SSR: SSR,
      SSE: SSE,
      SST: SST,
      MSE: MSE,
      RMSE: RMSE,
      residuals: residuals,
      predicted: yHat,
      durbinWatson: dw,
      n: n,
      p: p
    };
  }

  /* ================================================================
   *  LOGISTIC REGRESSION  (IRLS — Iteratively Reweighted Least Squares)
   * ================================================================ */

  function logisticRegression(y, xs, options) {
    if (!options) options = {};
    var maxIter = options.maxIter || 25;
    var tol = options.tol || 1e-8;

    if (xs.length > 0 && typeof xs[0] === "number") {
      xs = [xs];
    }

    var n = y.length;
    var p = xs.length;
    var cols = p + 1;

    // Design matrix with intercept
    var X = [];
    for (var i = 0; i < n; i++) {
      var row = [1];
      for (var j = 0; j < p; j++) row.push(xs[j][i]);
      X.push(row);
    }

    // Initialize betas to 0
    var beta = new Array(cols);
    for (var j = 0; j < cols; j++) beta[j] = 0;

    function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

    var converged = false;
    var iter;

    for (iter = 0; iter < maxIter; iter++) {
      // Compute probabilities
      var mu = [];
      for (var i = 0; i < n; i++) {
        var z = 0;
        for (var j = 0; j < cols; j++) z += beta[j] * X[i][j];
        mu.push(sigmoid(z));
      }

      // Weight matrix diagonal W = mu*(1-mu)
      var W = [];
      for (var i = 0; i < n; i++) {
        W.push(mu[i] * (1 - mu[i]));
        if (W[i] < 1e-10) W[i] = 1e-10; // prevent singularity
      }

      // X'WX
      var XtWX = [];
      for (var a = 0; a < cols; a++) {
        XtWX.push([]);
        for (var b = 0; b < cols; b++) {
          var s = 0;
          for (var i = 0; i < n; i++) s += X[i][a] * W[i] * X[i][b];
          XtWX[a].push(s);
        }
      }

      // X'(y - mu)
      var score = [];
      for (var a = 0; a < cols; a++) {
        var s = 0;
        for (var i = 0; i < n; i++) s += X[i][a] * (y[i] - mu[i]);
        score.push(s);
      }

      // delta = (X'WX)^-1 * X'(y-mu)
      var delta = solveLinearSystem(XtWX, score);
      if (!delta) break;

      var maxDelta = 0;
      for (var j = 0; j < cols; j++) {
        beta[j] += delta[j];
        if (Math.abs(delta[j]) > maxDelta) maxDelta = Math.abs(delta[j]);
      }

      if (maxDelta < tol) { converged = true; break; }
    }

    // Final probabilities
    var predicted = [];
    var logLik = 0;
    for (var i = 0; i < n; i++) {
      var z = 0;
      for (var j = 0; j < cols; j++) z += beta[j] * X[i][j];
      var pr = sigmoid(z);
      predicted.push(pr);
      logLik += y[i] * Math.log(pr + 1e-15) + (1 - y[i]) * Math.log(1 - pr + 1e-15);
    }

    // Null model log-likelihood
    var pBar = mean(y);
    var logLikNull = 0;
    for (var i = 0; i < n; i++) {
      logLikNull += y[i] * Math.log(pBar + 1e-15) + (1 - y[i]) * Math.log(1 - pBar + 1e-15);
    }

    var deviance = -2 * logLik;
    var nullDeviance = -2 * logLikNull;
    var pseudoR2 = 1 - logLik / logLikNull; // McFadden's

    // Odds ratios
    var oddsRatios = beta.map(function (b) { return Math.exp(b); });

    // Standard errors from inverse Hessian
    var mu2 = [];
    for (var i = 0; i < n; i++) {
      var z = 0;
      for (var j = 0; j < cols; j++) z += beta[j] * X[i][j];
      mu2.push(sigmoid(z));
    }
    var W2 = mu2.map(function (m) { return Math.max(m * (1 - m), 1e-10); });
    var H = [];
    for (var a = 0; a < cols; a++) {
      H.push([]);
      for (var b = 0; b < cols; b++) {
        var s = 0;
        for (var i = 0; i < n; i++) s += X[i][a] * W2[i] * X[i][b];
        H[a].push(s);
      }
    }
    var Hinv = invertMatrix(H);
    var seBetas = [];
    var zStats = [];
    var pValues = [];
    if (Hinv) {
      for (var j = 0; j < cols; j++) {
        var sej = Math.sqrt(Math.abs(Hinv[j][j]));
        seBetas.push(sej);
        var zj = beta[j] / sej;
        zStats.push(zj);
        pValues.push(2 * (1 - jStat.normal.cdf(Math.abs(zj), 0, 1)));
      }
    }

    // AIC / BIC
    var AIC = -2 * logLik + 2 * cols;
    var BIC = -2 * logLik + Math.log(n) * cols;

    return {
      test: "Logistic Regression (IRLS)",
      coefficients: beta,
      se: seBetas,
      zStats: zStats,
      pValues: pValues,
      oddsRatios: oddsRatios,
      logLikelihood: logLik,
      nullLogLikelihood: logLikNull,
      deviance: deviance,
      nullDeviance: nullDeviance,
      pseudoR2: pseudoR2,
      AIC: AIC,
      BIC: BIC,
      predicted: predicted,
      converged: converged,
      iterations: iter + 1,
      n: n,
      p: p
    };
  }

  /* ================================================================
   *  CRONBACH'S ALPHA  (with item-total correlations)
   * ================================================================ */

  function cronbachAlpha(items) {
    // items: array of arrays, each inner array is one item's responses
    var k = items.length;
    var n = items[0].length;

    // Total score for each respondent
    var totals = [];
    for (var i = 0; i < n; i++) {
      var t = 0;
      for (var j = 0; j < k; j++) t += items[j][i];
      totals.push(t);
    }

    // Variance of totals
    var varTotal = variance(totals, 1);

    // Sum of item variances
    var sumItemVar = 0;
    for (var j = 0; j < k; j++) sumItemVar += variance(items[j], 1);

    var alpha = (k / (k - 1)) * (1 - sumItemVar / varTotal);

    // Item-total correlations (corrected: correlate item with total minus item)
    var itemTotalCorrs = [];
    var alphaIfDeleted = [];
    for (var j = 0; j < k; j++) {
      // Total minus this item
      var correctedTotals = [];
      for (var i = 0; i < n; i++) correctedTotals.push(totals[i] - items[j][i]);
      var r = pearson(items[j], correctedTotals).r;
      itemTotalCorrs.push(r);

      // Alpha if this item deleted
      var remainingItems = [];
      for (var m = 0; m < k; m++) {
        if (m !== j) remainingItems.push(items[m]);
      }
      if (remainingItems.length > 1) {
        var totDel = [];
        for (var i = 0; i < n; i++) {
          var t = 0;
          for (var m = 0; m < remainingItems.length; m++) t += remainingItems[m][i];
          totDel.push(t);
        }
        var varTotDel = variance(totDel, 1);
        var sumVarDel = 0;
        for (var m = 0; m < remainingItems.length; m++) sumVarDel += variance(remainingItems[m], 1);
        var kDel = remainingItems.length;
        alphaIfDeleted.push((kDel / (kDel - 1)) * (1 - sumVarDel / varTotDel));
      } else {
        alphaIfDeleted.push(NaN);
      }
    }

    return {
      test: "Cronbach's Alpha",
      alpha: alpha,
      k: k,
      n: n,
      itemTotalCorrelations: itemTotalCorrs,
      alphaIfDeleted: alphaIfDeleted,
      sumItemVariance: sumItemVar,
      totalVariance: varTotal
    };
  }

  /* ================================================================
   *  PCA  (Principal Component Analysis via power iteration on cov matrix)
   * ================================================================ */

  function pca(data, options) {
    // data: array of arrays, each inner array = one variable (column)
    if (!options) options = {};
    var nComponents = options.nComponents || data.length;

    var k = data.length; // number of variables
    var n = data[0].length; // number of observations

    // Standardize
    var means = [];
    var sds = [];
    var Z = [];
    for (var j = 0; j < k; j++) {
      var m = mean(data[j]);
      var s = sd(data[j], 1);
      means.push(m);
      sds.push(s === 0 ? 1 : s);
      var col = [];
      for (var i = 0; i < n; i++) col.push((data[j][i] - m) / (s === 0 ? 1 : s));
      Z.push(col);
    }

    // Correlation/covariance matrix
    var C = [];
    for (var i = 0; i < k; i++) {
      C.push([]);
      for (var j = 0; j < k; j++) {
        var s = 0;
        for (var m = 0; m < n; m++) s += Z[i][m] * Z[j][m];
        C[i].push(s / (n - 1));
      }
    }

    // Eigendecomposition via Jacobi iteration
    var eigen = jacobiEigen(C);

    // Sort by eigenvalue descending
    var pairs = [];
    for (var i = 0; i < k; i++) {
      var vec = [];
      for (var j = 0; j < k; j++) vec.push(eigen.vectors[j][i]);
      pairs.push({ value: eigen.values[i], vector: vec });
    }
    pairs.sort(function (a, b) { return b.value - a.value; });

    var eigenvalues = pairs.map(function (p) { return p.value; });
    var eigenvectors = pairs.map(function (p) { return p.vector; });
    var totalVar = sum(eigenvalues.map(function (v) { return Math.max(v, 0); }));
    var explainedVariance = eigenvalues.map(function (v) { return totalVar > 0 ? Math.max(v, 0) / totalVar : 0; });
    var cumVariance = [];
    var cumSum = 0;
    for (var i = 0; i < explainedVariance.length; i++) {
      cumSum += explainedVariance[i];
      cumVariance.push(cumSum);
    }

    // Component scores
    var scores = [];
    for (var c = 0; c < Math.min(nComponents, k); c++) {
      var compScores = [];
      for (var i = 0; i < n; i++) {
        var s = 0;
        for (var j = 0; j < k; j++) s += eigenvectors[c][j] * Z[j][i];
        compScores.push(s);
      }
      scores.push(compScores);
    }

    // Loadings
    var loadings = [];
    for (var c = 0; c < Math.min(nComponents, k); c++) {
      var load = eigenvectors[c].map(function (v, idx) {
        return v * Math.sqrt(Math.max(eigenvalues[c], 0));
      });
      loadings.push(load);
    }

    return {
      test: "PCA",
      eigenvalues: eigenvalues.slice(0, nComponents),
      eigenvectors: eigenvectors.slice(0, nComponents),
      loadings: loadings,
      explainedVariance: explainedVariance.slice(0, nComponents),
      cumulativeVariance: cumVariance.slice(0, nComponents),
      scores: scores,
      k: k,
      n: n
    };
  }

  /* ================================================================
   *  FACTOR ANALYSIS  (PCA extraction + Varimax rotation)
   * ================================================================ */

  function factorAnalysis(data, options) {
    if (!options) options = {};
    var nFactors = options.nFactors || 2;
    var maxIter = options.maxIter || 100;
    var tol = options.tol || 1e-6;

    // Start with PCA
    var pcaResult = pca(data, { nComponents: nFactors });

    // Varimax rotation on loadings
    var loadings = pcaResult.loadings; // nFactors x k
    var k = data.length;

    // Transpose loadings to k x nFactors
    var L = [];
    for (var i = 0; i < k; i++) {
      L.push([]);
      for (var j = 0; j < nFactors; j++) {
        L[i].push(loadings[j][i]);
      }
    }

    // Varimax rotation
    L = varimax(L, maxIter, tol);

    // Communalities
    var communalities = [];
    for (var i = 0; i < k; i++) {
      var h2 = 0;
      for (var j = 0; j < nFactors; j++) h2 += L[i][j] * L[i][j];
      communalities.push(h2);
    }

    return {
      test: "Factor Analysis (Varimax)",
      loadings: L, // k x nFactors
      communalities: communalities,
      eigenvalues: pcaResult.eigenvalues,
      explainedVariance: pcaResult.explainedVariance,
      nFactors: nFactors,
      k: k,
      n: data[0].length
    };
  }

  function varimax(A, maxIter, tol) {
    // A: k x m matrix (loadings)
    var k = A.length;
    var m = A[0].length;
    if (m < 2) return A;

    // Copy
    var B = [];
    for (var i = 0; i < k; i++) B.push(A[i].slice());

    for (var iter = 0; iter < maxIter; iter++) {
      var maxRot = 0;
      for (var p = 0; p < m - 1; p++) {
        for (var q = p + 1; q < m; q++) {
          // Compute rotation angle
          var u = 0, v = 0, a2 = 0, b2 = 0;
          for (var i = 0; i < k; i++) {
            var xi = B[i][p];
            var yi = B[i][q];
            u += (xi * xi - yi * yi);
            v += 2 * xi * yi;
            a2 += (xi * xi - yi * yi) * (xi * xi - yi * yi);
            b2 += 4 * xi * yi * (xi * xi - yi * yi);
          }
          var num2 = 2 * k * b2 - 2 * v * u * 2;
          // Simplified varimax criterion
          var A2 = 0, B2 = 0, C2 = 0, D2 = 0;
          for (var i = 0; i < k; i++) {
            var xi = B[i][p], yi = B[i][q];
            var u2 = xi * xi - yi * yi;
            var v2 = 2 * xi * yi;
            A2 += u2;
            B2 += v2;
            C2 += u2 * u2 - v2 * v2;
            D2 += 2 * u2 * v2;
          }
          var numR = D2 - 2 * A2 * B2 / k;
          var denR = C2 - (A2 * A2 - B2 * B2) / k;
          var angle = 0.25 * Math.atan2(numR, denR);

          if (Math.abs(angle) > maxRot) maxRot = Math.abs(angle);

          var cos = Math.cos(angle), sin = Math.sin(angle);
          for (var i = 0; i < k; i++) {
            var xOld = B[i][p];
            var yOld = B[i][q];
            B[i][p] = xOld * cos + yOld * sin;
            B[i][q] = -xOld * sin + yOld * cos;
          }
        }
      }
      if (maxRot < tol) break;
    }
    return B;
  }

  /* ================================================================
   *  K-MEANS CLUSTERING  (K-means++ initialization, elbow method)
   * ================================================================ */

  function kMeans(data, k, options) {
    // data: array of arrays, each inner array = one variable (column)
    // Transpose to row-based observations
    if (!data || !data.length || !data[0] || !data[0].length) return { error: 'Data must be non-empty', valid: false };
    if (!options) options = {};
    var maxIter = options.maxIter || 100;

    var nVars = data.length;
    var n = data[0].length;

    // Build observation matrix (n x nVars)
    var obs = [];
    for (var i = 0; i < n; i++) {
      var row = [];
      for (var j = 0; j < nVars; j++) row.push(data[j][i]);
      obs.push(row);
    }

    // K-means++ initialization
    var centroids = kMeansPPInit(obs, k);

    var assignments = new Array(n);
    var converged = false;

    for (var iter = 0; iter < maxIter; iter++) {
      // Assignment step
      var changed = false;
      for (var i = 0; i < n; i++) {
        var minDist = Infinity;
        var closest = 0;
        for (var c = 0; c < k; c++) {
          var d = euclidean(obs[i], centroids[c]);
          if (d < minDist) { minDist = d; closest = c; }
        }
        if (assignments[i] !== closest) { changed = true; assignments[i] = closest; }
      }

      if (!changed) { converged = true; break; }

      // Update step
      for (var c = 0; c < k; c++) {
        var count = 0;
        var newCentroid = new Array(nVars);
        for (var j = 0; j < nVars; j++) newCentroid[j] = 0;
        for (var i = 0; i < n; i++) {
          if (assignments[i] === c) {
            count++;
            for (var j = 0; j < nVars; j++) newCentroid[j] += obs[i][j];
          }
        }
        if (count > 0) {
          for (var j = 0; j < nVars; j++) centroids[c][j] = newCentroid[j] / count;
        }
      }
    }

    // Compute cluster sizes and within-cluster SS
    var clusterSizes = new Array(k);
    var withinSS = new Array(k);
    for (var c = 0; c < k; c++) { clusterSizes[c] = 0; withinSS[c] = 0; }
    var totalWithinSS = 0;
    for (var i = 0; i < n; i++) {
      var c = assignments[i];
      clusterSizes[c]++;
      var d = euclidean(obs[i], centroids[c]);
      withinSS[c] += d * d;
      totalWithinSS += d * d;
    }

    // Total SS
    var grandCentroid = [];
    for (var j = 0; j < nVars; j++) {
      var s = 0;
      for (var i = 0; i < n; i++) s += obs[i][j];
      grandCentroid.push(s / n);
    }
    var totalSS = 0;
    for (var i = 0; i < n; i++) {
      var d = euclidean(obs[i], grandCentroid);
      totalSS += d * d;
    }
    var betweenSS = totalSS - totalWithinSS;

    return {
      test: "K-Means Clustering",
      assignments: assignments,
      centroids: centroids,
      k: k,
      n: n,
      clusterSizes: clusterSizes,
      withinSS: withinSS,
      totalWithinSS: totalWithinSS,
      betweenSS: betweenSS,
      totalSS: totalSS,
      converged: converged
    };
  }

  function elbowMethod(data, maxK) {
    if (!maxK) maxK = 10;
    var results = [];
    var kMax = Math.min(maxK, data[0].length - 1);
    for (var k = 1; k <= kMax; k++) {
      var res = kMeans(data, k);
      results.push({ k: k, withinSS: res.totalWithinSS });
    }
    return results;
  }

  function kMeansPPInit(obs, k) {
    var n = obs.length;
    var nVars = obs[0].length;
    var centroids = [];

    // Pick first centroid randomly
    var idx = Math.floor(Math.random() * n);
    centroids.push(obs[idx].slice());

    for (var c = 1; c < k; c++) {
      var dists = [];
      var totalDist = 0;
      for (var i = 0; i < n; i++) {
        var minD = Infinity;
        for (var j = 0; j < centroids.length; j++) {
          var d = euclidean(obs[i], centroids[j]);
          if (d < minD) minD = d;
        }
        dists.push(minD * minD);
        totalDist += minD * minD;
      }

      // Weighted random selection
      var r = Math.random() * totalDist;
      var cumSum2 = 0;
      var chosen = 0;
      for (var i = 0; i < n; i++) {
        cumSum2 += dists[i];
        if (cumSum2 >= r) { chosen = i; break; }
      }
      centroids.push(obs[chosen].slice());
    }

    return centroids;
  }

  function euclidean(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
    return Math.sqrt(s);
  }

  /* ================================================================
   *  LINEAR ALGEBRA HELPERS
   * ================================================================ */

  function solveLinearSystem(A, b) {
    var n = A.length;
    // Augmented matrix
    var aug = [];
    for (var i = 0; i < n; i++) {
      aug.push(A[i].slice());
      aug[i].push(b[i]);
    }

    // Forward elimination with partial pivoting
    for (var col = 0; col < n; col++) {
      // Find pivot
      var maxVal = Math.abs(aug[col][col]);
      var maxRow = col;
      for (var row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > maxVal) {
          maxVal = Math.abs(aug[row][col]);
          maxRow = row;
        }
      }
      if (maxVal < 1e-12) return null; // singular

      // Swap rows
      var tmp = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = tmp;

      // Eliminate below
      for (var row = col + 1; row < n; row++) {
        var factor = aug[row][col] / aug[col][col];
        for (var j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
      }
    }

    // Back substitution
    var x = new Array(n);
    for (var i = n - 1; i >= 0; i--) {
      x[i] = aug[i][n];
      for (var j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
      x[i] /= aug[i][i];
    }
    return x;
  }

  function invertMatrix(A) {
    var n = A.length;
    // Augment with identity
    var aug = [];
    for (var i = 0; i < n; i++) {
      aug.push(A[i].slice());
      for (var j = 0; j < n; j++) aug[i].push(i === j ? 1 : 0);
    }

    // Gauss-Jordan
    for (var col = 0; col < n; col++) {
      var maxVal = Math.abs(aug[col][col]);
      var maxRow = col;
      for (var row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > maxVal) {
          maxVal = Math.abs(aug[row][col]);
          maxRow = row;
        }
      }
      if (maxVal < 1e-12) return null;

      var tmp = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = tmp;

      var pivot = aug[col][col];
      for (var j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

      for (var row = 0; row < n; row++) {
        if (row === col) continue;
        var factor = aug[row][col];
        for (var j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
      }
    }

    // Extract inverse
    var inv = [];
    for (var i = 0; i < n; i++) {
      inv.push(aug[i].slice(n));
    }
    return inv;
  }

  function jacobiEigen(A) {
    var n = A.length;
    var maxIter = 100;
    var tol = 1e-10;

    // Copy A
    var S = [];
    for (var i = 0; i < n; i++) S.push(A[i].slice());

    // Initialize eigenvector matrix to identity
    var V = [];
    for (var i = 0; i < n; i++) {
      V.push([]);
      for (var j = 0; j < n; j++) V[i].push(i === j ? 1 : 0);
    }

    for (var iter = 0; iter < maxIter; iter++) {
      // Find largest off-diagonal element
      var maxOff = 0;
      var p = 0, q = 1;
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          if (Math.abs(S[i][j]) > maxOff) {
            maxOff = Math.abs(S[i][j]);
            p = i; q = j;
          }
        }
      }
      if (maxOff < tol) break;

      // Compute rotation
      var theta;
      if (Math.abs(S[p][p] - S[q][q]) < 1e-15) {
        theta = Math.PI / 4;
      } else {
        theta = 0.5 * Math.atan2(2 * S[p][q], S[p][p] - S[q][q]);
      }
      var c = Math.cos(theta), s = Math.sin(theta);

      // Rotate S
      var newS = [];
      for (var i = 0; i < n; i++) newS.push(S[i].slice());

      newS[p][p] = c * c * S[p][p] + 2 * s * c * S[p][q] + s * s * S[q][q];
      newS[q][q] = s * s * S[p][p] - 2 * s * c * S[p][q] + c * c * S[q][q];
      newS[p][q] = 0;
      newS[q][p] = 0;

      for (var i = 0; i < n; i++) {
        if (i !== p && i !== q) {
          newS[p][i] = c * S[p][i] + s * S[q][i];
          newS[i][p] = newS[p][i];
          newS[q][i] = -s * S[p][i] + c * S[q][i];
          newS[i][q] = newS[q][i];
        }
      }
      S = newS;

      // Update eigenvectors
      for (var i = 0; i < n; i++) {
        var vip = V[i][p];
        var viq = V[i][q];
        V[i][p] = c * vip + s * viq;
        V[i][q] = -s * vip + c * viq;
      }
    }

    var values = [];
    for (var i = 0; i < n; i++) values.push(S[i][i]);

    return { values: values, vectors: V };
  }

  /* ================================================================
   *  FREQUENCIES & CROSSTABS
   * ================================================================ */

  function frequencies(values) {
    var counts = {};
    var n = values.length;
    for (var i = 0; i < n; i++) {
      var v = String(values[i]);
      counts[v] = (counts[v] || 0) + 1;
    }

    var percentages = {};
    var uniqueValues = Object.keys(counts);
    for (var i = 0; i < uniqueValues.length; i++) {
      percentages[uniqueValues[i]] = (counts[uniqueValues[i]] / n) * 100;
    }

    // Find mode
    var modeVal = uniqueValues[0];
    var modeCount = counts[modeVal];
    for (var i = 1; i < uniqueValues.length; i++) {
      if (counts[uniqueValues[i]] > modeCount) {
        modeVal = uniqueValues[i];
        modeCount = counts[uniqueValues[i]];
      }
    }

    return {
      test: "Frequencies",
      counts: counts,
      percentages: percentages,
      n: n,
      uniqueValues: uniqueValues,
      mode: modeVal,
      modeCount: modeCount
    };
  }

  function crossTab(colA, colB) {
    if (!colA || !colB || !colA.length || !colB.length) return { error: 'Arrays must be non-empty', valid: false };
    if (colA.length !== colB.length) return { error: "crossTab requires equal-length arrays", valid: false };
    var n = colA.length;

    // Collect unique labels
    var rowSet = {};
    var colSet = {};
    for (var i = 0; i < n; i++) {
      rowSet[String(colA[i])] = true;
      colSet[String(colB[i])] = true;
    }
    var rowLabels = Object.keys(rowSet).sort();
    var colLabels = Object.keys(colSet).sort();

    // Build count table
    var table = [];
    var rowTotals = [];
    for (var r = 0; r < rowLabels.length; r++) {
      table.push([]);
      var rt = 0;
      for (var c = 0; c < colLabels.length; c++) {
        table[r].push(0);
      }
    }

    for (var i = 0; i < n; i++) {
      var ri = rowLabels.indexOf(String(colA[i]));
      var ci = colLabels.indexOf(String(colB[i]));
      table[ri][ci]++;
    }

    // Totals
    for (var r = 0; r < rowLabels.length; r++) {
      var rt = 0;
      for (var c = 0; c < colLabels.length; c++) rt += table[r][c];
      rowTotals.push(rt);
    }

    var colTotals = [];
    for (var c = 0; c < colLabels.length; c++) {
      var ct = 0;
      for (var r = 0; r < rowLabels.length; r++) ct += table[r][c];
      colTotals.push(ct);
    }

    return {
      test: "Cross Tabulation",
      table: table,
      rowTotals: rowTotals,
      colTotals: colTotals,
      grandTotal: n,
      rowLabels: rowLabels,
      colLabels: colLabels
    };
  }

  /* ================================================================
   *  PHI COEFFICIENT
   * ================================================================ */

  function phi(table) {
    // table: [[a,b],[c,d]]
    var a = table[0][0], b = table[0][1];
    var c = table[1][0], d = table[1][1];
    var n = a + b + c + d;

    var num = (a * d) - (b * c);
    var den = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
    var phiVal = den === 0 ? 0 : num / den;

    // Chi-square = n * phi^2
    var chi2 = n * phiVal * phiVal;
    var p = 1 - jStat.chisquare.cdf(chi2, 1);

    return {
      test: "Phi Coefficient",
      phi: phiVal,
      chiSquare: chi2,
      p: p,
      n: n
    };
  }

  /* ================================================================
   *  KENDALL'S TAU
   * ================================================================ */

  function kendallTau(x, y) {
    if (!x || !y || !x.length || !y.length) return { error: 'Arrays must be non-empty', valid: false };
    if (x.length !== y.length) return { error: "Arrays must be equal length", valid: false };
    var n = x.length;
    var concordant = 0;
    var discordant = 0;
    var tiesX = 0;
    var tiesY = 0;
    var tiesXY = 0;

    for (var i = 0; i < n - 1; i++) {
      for (var j = i + 1; j < n; j++) {
        var dx = x[i] - x[j];
        var dy = y[i] - y[j];
        if (dx === 0 && dy === 0) {
          tiesXY++;
          tiesX++;
          tiesY++;
        } else if (dx === 0) {
          tiesX++;
        } else if (dy === 0) {
          tiesY++;
        } else if ((dx > 0 && dy > 0) || (dx < 0 && dy < 0)) {
          concordant++;
        } else {
          discordant++;
        }
      }
    }

    var n0 = n * (n - 1) / 2;
    var n1 = tiesX; // number of ties in x
    var n2 = tiesY; // number of ties in y

    var denTauB = Math.sqrt((n0 - n1) * (n0 - n2));
    var tau = denTauB === 0 ? 0 : (concordant - discordant) / denTauB;

    // Normal approximation for p-value with tie-corrected variance (Agresti 2002)
    var S = concordant - discordant;

    // Build tie groups for X and Y
    var xGroups = {}, yGroups = {};
    for (var i = 0; i < n; i++) {
      xGroups[x[i]] = (xGroups[x[i]] || 0) + 1;
      yGroups[y[i]] = (yGroups[y[i]] || 0) + 1;
    }

    var v0 = n * (n - 1) * (2 * n + 5);
    var tieTermX = 0, tieTermY = 0;
    var tx2 = 0, ty2 = 0;
    var tx3 = 0, ty3 = 0;
    Object.values(xGroups).forEach(function(t) {
      if (t > 1) {
        tieTermX += t * (t - 1) * (2 * t + 5);
        tx2 += t * (t - 1);
        tx3 += t * (t - 1) * (t - 2);
      }
    });
    Object.values(yGroups).forEach(function(t) {
      if (t > 1) {
        tieTermY += t * (t - 1) * (2 * t + 5);
        ty2 += t * (t - 1);
        ty3 += t * (t - 1) * (t - 2);
      }
    });

    var varS = (v0 - tieTermX - tieTermY) / 18
             + (tx2 * ty2) / (2 * n * (n - 1))
             + (tx3 * ty3) / (9 * n * (n - 1) * (n - 2));
    var se = Math.sqrt(varS);
    var z = se === 0 ? 0 : S / se;
    var p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));

    return {
      test: "Kendall's Tau-b",
      tau: tau,
      p: p,
      n: n,
      concordant: concordant,
      discordant: discordant,
      ties: tiesX + tiesY - tiesXY,
      z: z
    };
  }

  /* ================================================================
   *  SIMPLE LINEAR REGRESSION (wrapper around linearRegression)
   * ================================================================ */

  function simpleRegression(x, y) {
    var result = linearRegression(y, [x]);

    // Add convenience fields
    var intercept = result.coefficients ? result.coefficients[0] : NaN;
    var slope = result.coefficients ? result.coefficients[1] : NaN;
    var r = Math.sqrt(result.R2);
    // Determine sign of correlation from slope
    if (slope < 0) r = -r;

    result.slope = slope;
    result.intercept = intercept;
    result.rSquared = result.R2;
    result.correlation = r;
    result.predictionEquation = "y = " + intercept.toFixed(4) + " + " + slope.toFixed(4) + " * x";

    return result;
  }

  /* ================================================================
   *  COHEN'S KAPPA
   * ================================================================ */

  function cohensKappa(rater1, rater2) {
    if (!rater1 || !rater2 || !rater1.length || !rater2.length) return { error: 'Arrays must be non-empty', valid: false };
    if (rater1.length !== rater2.length) return { error: "Rater arrays must be equal length", valid: false };
    var n = rater1.length;

    // Collect categories
    var catSet = {};
    for (var i = 0; i < n; i++) {
      catSet[String(rater1[i])] = true;
      catSet[String(rater2[i])] = true;
    }
    var categories = Object.keys(catSet).sort();
    var k = categories.length;

    // Build confusion matrix
    var matrix = [];
    for (var i = 0; i < k; i++) {
      matrix.push([]);
      for (var j = 0; j < k; j++) matrix[i].push(0);
    }
    for (var i = 0; i < n; i++) {
      var ri = categories.indexOf(String(rater1[i]));
      var ci = categories.indexOf(String(rater2[i]));
      matrix[ri][ci]++;
    }

    // Observed agreement (po)
    var agreed = 0;
    for (var i = 0; i < k; i++) agreed += matrix[i][i];
    var po = agreed / n;

    // Expected agreement (pe)
    var pe = 0;
    for (var cat = 0; cat < k; cat++) {
      var rowSum = 0;
      var colSum = 0;
      for (var j = 0; j < k; j++) {
        rowSum += matrix[cat][j];
        colSum += matrix[j][cat];
      }
      pe += (rowSum / n) * (colSum / n);
    }

    var kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);

    // Standard error (simplified)
    var seKappa = pe === 1 ? 0 : Math.sqrt(pe / (n * (1 - pe)));

    // z-test and p-value
    var z = seKappa === 0 ? 0 : kappa / seKappa;
    var p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));

    // 95% CI
    var ciLower = kappa - 1.96 * seKappa;
    var ciUpper = kappa + 1.96 * seKappa;

    return {
      test: "Cohen's Kappa",
      kappa: kappa,
      p: p,
      se: seKappa,
      ci95: { lower: ciLower, upper: ciUpper },
      observedAgreement: po,
      expectedAgreement: pe,
      n: n,
      categories: categories,
      z: z
    };
  }

  /* ================================================================
   *  A/B TEST ANALYSIS
   * ================================================================ */

  function abTest(control, variant, type) {
    if (!type) type = "continuous";

    var result;

    if (type === "continuous") {
      result = ttest(control, variant);
      result.type = "continuous";

      var nC = control.length, nV = variant.length;
      var mC = mean(control), mV = mean(variant);
      var sC = sd(control, 1), sV = sd(variant, 1);

      result.controlSummary = { n: nC, mean: mC, sd: sC };
      result.variantSummary = { n: nV, mean: mV, sd: sV };

      // Lift
      var lift = mC === 0 ? 0 : ((mV - mC) / Math.abs(mC)) * 100;
      result.lift = lift;

      // Lift CI from the t-test CI on the difference
      var liftLower = mC === 0 ? 0 : (result.ci95.lower / Math.abs(mC)) * 100;
      var liftUpper = mC === 0 ? 0 : (result.ci95.upper / Math.abs(mC)) * 100;
      result.liftCI = { lower: liftLower, upper: liftUpper };

      // Cohen's d for power
      var pooledSD = Math.sqrt(((nC - 1) * sC * sC + (nV - 1) * sV * sV) / (nC + nV - 2));
      var d = pooledSD === 0 ? 0 : Math.abs(mV - mC) / pooledSD;
      var nHarmonic = 2 * nC * nV / (nC + nV);

      // Power approximation (normal approximation)
      var ncp = d * Math.sqrt(nHarmonic / 2);
      var zAlpha = 1.96;
      var power = 1 - jStat.normal.cdf(zAlpha - ncp, 0, 1);
      result.power = power;

      // Recommended N per group for 80% power
      var zBeta = 0.8416; // z for 80% power
      var recN = d === 0 ? Infinity : Math.ceil(2 * Math.pow((zAlpha + zBeta) / d, 2));
      result.recommendedN = recN;

    } else {
      // Binary (arrays of 0/1)
      var nC = control.length, nV = variant.length;
      var xC = sum(control), xV = sum(variant);
      var rateC = xC / nC, rateV = xV / nV;

      var zResult = twoProportionZ(xC, nC, xV, nV);
      result = {};
      for (var key in zResult) result[key] = zResult[key];

      result.type = "binary";
      result.controlSummary = { n: nC, rate: rateC, conversions: xC };
      result.variantSummary = { n: nV, rate: rateV, conversions: xV };

      // Lift
      var lift = rateC === 0 ? 0 : ((rateV - rateC) / rateC) * 100;
      result.lift = lift;

      // Lift CI
      var seDiff = Math.sqrt(rateC * (1 - rateC) / nC + rateV * (1 - rateV) / nV);
      var diffLower = (rateV - rateC) - 1.96 * seDiff;
      var diffUpper = (rateV - rateC) + 1.96 * seDiff;
      var liftLower = rateC === 0 ? 0 : (diffLower / rateC) * 100;
      var liftUpper = rateC === 0 ? 0 : (diffUpper / rateC) * 100;
      result.liftCI = { lower: liftLower, upper: liftUpper };

      // Power using arcsine formula
      var h = 2 * Math.asin(Math.sqrt(rateV)) - 2 * Math.asin(Math.sqrt(rateC));
      var nHarmonic = 2 * nC * nV / (nC + nV);
      var ncp = Math.abs(h) * Math.sqrt(nHarmonic / 2);
      var zAlpha = 1.96;
      var power = 1 - jStat.normal.cdf(zAlpha - ncp, 0, 1);
      result.power = power;

      // Recommended N per group for 80% power (arcsine)
      var zBeta = 0.8416;
      var recN = h === 0 ? Infinity : Math.ceil(Math.pow((zAlpha + zBeta) / Math.abs(h), 2));
      result.recommendedN = recN;
    }

    return result;
  }

  /* ================================================================
   *  WORD FREQUENCY ANALYSIS
   * ================================================================ */

  var STOPWORDS = ["the","a","an","is","are","was","were","be","been","have","has","had",
    "do","does","did","will","would","could","should","may","might","can","shall",
    "to","of","in","for","on","with","at","by","from","as","into","through","during",
    "before","after","above","below","between","out","off","over","under","again",
    "further","then","once","here","there","when","where","why","how","all","each",
    "every","both","few","more","most","other","some","such","no","not","only","own",
    "same","so","than","too","very","just","because","but","and","or","if","while",
    "about","up","it","its","this","that","these","those","i","me","my","we","our",
    "you","your","he","him","his","she","her","they","them","their","what","which",
    "who","whom"];

  function wordFrequency(texts) {
    var totalWords = 0;
    var wordCounts = {};
    var bigramCounts = {};
    var responses = texts.length;

    var stopSet = {};
    for (var i = 0; i < STOPWORDS.length; i++) stopSet[STOPWORDS[i]] = true;

    for (var t = 0; t < texts.length; t++) {
      var raw = String(texts[t]).toLowerCase();
      // Tokenize: split on non-alphanumeric characters
      var tokens = raw.split(/[^a-z0-9']+/).filter(function (w) { return w.length > 0; });

      // Filter stopwords
      var filtered = [];
      for (var i = 0; i < tokens.length; i++) {
        totalWords++;
        if (!stopSet[tokens[i]] && tokens[i].length > 1) {
          filtered.push(tokens[i]);
          wordCounts[tokens[i]] = (wordCounts[tokens[i]] || 0) + 1;
        }
      }

      // Bigrams from filtered tokens
      for (var i = 0; i < filtered.length - 1; i++) {
        var bg = filtered[i] + " " + filtered[i + 1];
        bigramCounts[bg] = (bigramCounts[bg] || 0) + 1;
      }
    }

    // Sort words by count
    var wordKeys = Object.keys(wordCounts);
    wordKeys.sort(function (a, b) { return wordCounts[b] - wordCounts[a]; });

    var uniqueWords = wordKeys.length;
    var topWords = [];
    for (var i = 0; i < Math.min(50, wordKeys.length); i++) {
      topWords.push({
        word: wordKeys[i],
        count: wordCounts[wordKeys[i]],
        pct: totalWords > 0 ? (wordCounts[wordKeys[i]] / totalWords) * 100 : 0
      });
    }

    // Sort bigrams by count
    var bgKeys = Object.keys(bigramCounts);
    bgKeys.sort(function (a, b) { return bigramCounts[b] - bigramCounts[a]; });
    var bigramTop = [];
    for (var i = 0; i < Math.min(20, bgKeys.length); i++) {
      bigramTop.push({ bigram: bgKeys[i], count: bigramCounts[bgKeys[i]] });
    }

    return {
      test: "Word Frequency Analysis",
      totalWords: totalWords,
      uniqueWords: uniqueWords,
      topWords: topWords,
      bigramTop: bigramTop,
      avgWordsPerResponse: responses > 0 ? totalWords / responses : 0,
      responses: responses
    };
  }

  /* ================================================================
   *  WELCH'S ANOVA
   * ================================================================ */

  function welchAnova(groups) {
    var k = groups.length;
    var ns = [];
    var means_arr = [];
    var vars = [];
    var N = 0;

    for (var i = 0; i < k; i++) {
      var ni = groups[i].length;
      ns.push(ni);
      N += ni;
      means_arr.push(mean(groups[i]));
      vars.push(variance(groups[i], 1));
    }

    // Weights: wi = ni / si^2
    var w = [];
    var W = 0;
    for (var i = 0; i < k; i++) {
      var wi = vars[i] === 0 ? 1e12 : ns[i] / vars[i];
      w.push(wi);
      W += wi;
    }

    // Weighted grand mean: x_tilde = sum(wi * xi_bar) / W
    var xTilde = 0;
    for (var i = 0; i < k; i++) {
      xTilde += w[i] * means_arr[i];
    }
    xTilde /= W;

    // Numerator of Welch's F
    var numSum = 0;
    for (var i = 0; i < k; i++) {
      numSum += w[i] * Math.pow(means_arr[i] - xTilde, 2);
    }
    var fNum = numSum / (k - 1);

    // Denominator: 1 + 2*(k-2)/(k^2-1) * sum((1 - wi/W)^2 / (ni-1))
    var lambdaSum = 0;
    for (var i = 0; i < k; i++) {
      var term = Math.pow(1 - w[i] / W, 2) / (ns[i] - 1);
      lambdaSum += term;
    }
    var fDen = 1 + (2 * (k - 2) / (k * k - 1)) * lambdaSum;

    var F = fDen === 0 ? 0 : fNum / fDen;

    // Degrees of freedom
    var df1 = k - 1;
    // Welch-Satterthwaite for df2
    var df2Inv = (3 / (k * k - 1)) * lambdaSum;
    var df2 = df2Inv === 0 ? Infinity : 1 / df2Inv;

    var p = 1 - jStat.centralF.cdf(F, df1, df2);

    // Group stats
    var groupStats = [];
    for (var i = 0; i < k; i++) {
      groupStats.push({
        n: ns[i],
        mean: means_arr[i],
        sd: Math.sqrt(vars[i]),
        variance: vars[i]
      });
    }

    return {
      test: "Welch's ANOVA",
      F: F,
      p: p,
      df1: df1,
      df2: df2,
      k: k,
      N: N,
      groupStats: groupStats,
      means: means_arr
    };
  }

  /* ================================================================
   *  DUMMY CODE HELPER
   * ================================================================ */

  function dummyCode(categories) {
    // Get unique levels, use first as reference
    var levels = [];
    categories.forEach(function(c) { if (levels.indexOf(c) === -1) levels.push(c); });
    levels.sort();
    var ref = levels[0];
    var dummies = [];
    for (var i = 1; i < levels.length; i++) {
      dummies.push(categories.map(function(c) { return c === levels[i] ? 1 : 0; }));
    }
    return { dummies: dummies, levels: levels, reference: ref };
  }

  /* ================================================================
   *  FRIEDMAN TEST
   * ================================================================ */

  function friedman(groups) {
    var k = groups.length;
    var n = groups[0].length;

    // For each subject (row), rank across conditions
    var rankSums = new Array(k);
    for (var j = 0; j < k; j++) rankSums[j] = 0;

    for (var i = 0; i < n; i++) {
      // Gather this subject's scores across conditions
      var row = [];
      for (var j = 0; j < k; j++) row.push(groups[j][i]);
      var rowRanks = rank(row);
      for (var j = 0; j < k; j++) rankSums[j] += rowRanks[j];
    }

    var meanRanks = rankSums.map(function(r) { return r / n; });

    // Chi-square statistic
    var sumRj2 = 0;
    for (var j = 0; j < k; j++) sumRj2 += rankSums[j] * rankSums[j];
    var chi2 = (12 / (n * k * (k + 1))) * sumRj2 - 3 * n * (k + 1);

    var df = k - 1;
    var p = 1 - jStat.chisquare.cdf(chi2, df);

    // Group stats
    var groupStats = [];
    for (var j = 0; j < k; j++) {
      groupStats.push({
        mean: mean(groups[j]),
        median: median(groups[j]),
        sd: sd(groups[j], 1)
      });
    }

    return {
      test: "Friedman Test",
      chi2: chi2,
      p: p,
      df: df,
      k: k,
      n: n,
      rankSums: rankSums,
      meanRanks: meanRanks,
      groupStats: groupStats
    };
  }

  /* ================================================================
   *  REPEATED MEASURES ANOVA
   * ================================================================ */

  function repeatedMeasuresAnova(groups) {
    var k = groups.length;
    var n = groups[0].length;

    // Grand mean
    var allVals = [];
    var groupMeans = [];
    for (var j = 0; j < k; j++) {
      groupMeans.push(mean(groups[j]));
      for (var i = 0; i < n; i++) allVals.push(groups[j][i]);
    }
    var grandMean = mean(allVals);

    // Subject means
    var subjectMeans = [];
    for (var i = 0; i < n; i++) {
      var s = 0;
      for (var j = 0; j < k; j++) s += groups[j][i];
      subjectMeans.push(s / k);
    }

    // SS Total
    var ssTotal = 0;
    for (var j = 0; j < k; j++) {
      for (var i = 0; i < n; i++) {
        ssTotal += Math.pow(groups[j][i] - grandMean, 2);
      }
    }

    // SS Treatment (between conditions)
    var ssTreatment = 0;
    for (var j = 0; j < k; j++) {
      ssTreatment += n * Math.pow(groupMeans[j] - grandMean, 2);
    }

    // SS Subjects (between subjects)
    var ssSubjects = 0;
    for (var i = 0; i < n; i++) {
      ssSubjects += k * Math.pow(subjectMeans[i] - grandMean, 2);
    }

    // SS Error = SS Total - SS Treatment - SS Subjects
    var ssError = ssTotal - ssTreatment - ssSubjects;

    var df1 = k - 1;
    var df2 = (k - 1) * (n - 1);
    var msTreatment = ssTreatment / df1;
    var msError = ssError / df2;
    var F = msError === 0 ? (msTreatment > 0 ? Infinity : 0) : msTreatment / msError;
    var p = isFinite(F) ? 1 - jStat.centralF.cdf(F, df1, df2) : (msTreatment > 0 ? 0 : 1);
    var etaSquared = (ssTreatment + ssError) === 0 ? 0 : ssTreatment / (ssTreatment + ssError);

    // Greenhouse-Geisser epsilon correction for sphericity
    // Compute the variance-covariance matrix of the conditions
    var S = [];
    for (var j1 = 0; j1 < k; j1++) {
      S.push([]);
      for (var j2 = 0; j2 < k; j2++) {
        var cov = 0;
        for (var i = 0; i < n; i++) {
          cov += (groups[j1][i] - groupMeans[j1]) * (groups[j2][i] - groupMeans[j2]);
        }
        S[j1].push(cov / (n - 1));
      }
    }

    // Epsilon = (sum of diagonal means - grand cov mean)^2 / ...
    var meanDiag = 0;
    for (var j = 0; j < k; j++) meanDiag += S[j][j];
    meanDiag /= k;

    var grandCovMean = 0;
    for (var j1 = 0; j1 < k; j1++) {
      for (var j2 = 0; j2 < k; j2++) grandCovMean += S[j1][j2];
    }
    grandCovMean /= (k * k);

    var rowMeans = [];
    for (var j1 = 0; j1 < k; j1++) {
      var rm = 0;
      for (var j2 = 0; j2 < k; j2++) rm += S[j1][j2];
      rowMeans.push(rm / k);
    }

    var traceS = 0;
    for (var j = 0; j < k; j++) traceS += S[j][j];
    var traceSS = 0;
    for (var j1 = 0; j1 < k; j1++) {
      for (var j2 = 0; j2 < k; j2++) traceSS += S[j1][j2] * S[j1][j2];
    }

    var epsNum = Math.pow(traceS - grandCovMean * k, 2);
    var epsDen = (k - 1) * (traceSS - 2 * k * sum(rowMeans.map(function(rm) { return rm * rm; })) + k * k * grandCovMean * grandCovMean);
    var epsilon = epsDen === 0 ? 1 : epsNum / epsDen;
    epsilon = Math.min(1, Math.max(1 / (k - 1), epsilon));

    var correctedDf1 = epsilon * df1;
    var correctedDf2 = epsilon * df2;
    var correctedP = 1 - jStat.centralF.cdf(F, correctedDf1, correctedDf2);

    // Group stats
    var groupStatsArr = [];
    for (var j = 0; j < k; j++) {
      groupStatsArr.push({
        mean: groupMeans[j],
        sd: sd(groups[j], 1)
      });
    }

    return {
      test: "Repeated Measures ANOVA",
      F: F,
      p: p,
      df1: df1,
      df2: df2,
      etaSquared: etaSquared,
      ssTreatment: ssTreatment,
      ssError: ssError,
      ssSubjects: ssSubjects,
      ssTotal: ssTotal,
      epsilon: epsilon,
      correctedP: correctedP,
      correctedDf1: correctedDf1,
      correctedDf2: correctedDf2,
      k: k,
      n: n,
      groupStats: groupStatsArr
    };
  }

  /* ================================================================
   *  TWO-WAY ANOVA
   * ================================================================ */

  function twoWayAnova(y, factorA, factorB) {
    var N = y.length;

    // Get unique levels
    var levelsA = [];
    var levelsB = [];
    for (var i = 0; i < N; i++) {
      if (levelsA.indexOf(factorA[i]) === -1) levelsA.push(factorA[i]);
      if (levelsB.indexOf(factorB[i]) === -1) levelsB.push(factorB[i]);
    }
    levelsA.sort();
    levelsB.sort();

    var a = levelsA.length;
    var b = levelsB.length;

    // Grand mean
    var grandMean = mean(y);

    // Compute marginal means for factor A
    var meansA = {};
    var nsA = {};
    for (var i = 0; i < a; i++) { meansA[levelsA[i]] = 0; nsA[levelsA[i]] = 0; }
    for (var i = 0; i < N; i++) {
      meansA[factorA[i]] += y[i];
      nsA[factorA[i]]++;
    }
    for (var i = 0; i < a; i++) meansA[levelsA[i]] /= nsA[levelsA[i]];

    // Compute marginal means for factor B
    var meansB = {};
    var nsB = {};
    for (var i = 0; i < b; i++) { meansB[levelsB[i]] = 0; nsB[levelsB[i]] = 0; }
    for (var i = 0; i < N; i++) {
      meansB[factorB[i]] += y[i];
      nsB[factorB[i]]++;
    }
    for (var i = 0; i < b; i++) meansB[levelsB[i]] /= nsB[levelsB[i]];

    // Cell means
    var cellMeans = {};
    var cellNs = {};
    for (var i = 0; i < N; i++) {
      var key = factorA[i] + "|" + factorB[i];
      if (!cellMeans[key]) { cellMeans[key] = 0; cellNs[key] = 0; }
      cellMeans[key] += y[i];
      cellNs[key]++;
    }
    for (var key in cellMeans) cellMeans[key] /= cellNs[key];

    // SS Total
    var ssTotal = 0;
    for (var i = 0; i < N; i++) ssTotal += Math.pow(y[i] - grandMean, 2);

    // SS_A
    var ssA = 0;
    for (var i = 0; i < a; i++) {
      ssA += nsA[levelsA[i]] * Math.pow(meansA[levelsA[i]] - grandMean, 2);
    }

    // SS_B
    var ssB = 0;
    for (var i = 0; i < b; i++) {
      ssB += nsB[levelsB[i]] * Math.pow(meansB[levelsB[i]] - grandMean, 2);
    }

    // SS_cells
    var ssCells = 0;
    for (var key in cellMeans) {
      ssCells += cellNs[key] * Math.pow(cellMeans[key] - grandMean, 2);
    }

    // SS_AB (interaction) — clamp to 0 for unbalanced designs where Type I decomposition can go negative
    var ssAB = Math.max(0, ssCells - ssA - ssB);

    // SS_error
    var ssError = 0;
    for (var i = 0; i < N; i++) {
      var key = factorA[i] + "|" + factorB[i];
      ssError += Math.pow(y[i] - cellMeans[key], 2);
    }

    // Degrees of freedom
    var dfA = a - 1;
    var dfB = b - 1;
    var dfAB = dfA * dfB;
    var dfError = N - a * b;
    var dfTotal = N - 1;

    // Mean squares
    var msA = dfA === 0 ? 0 : ssA / dfA;
    var msB = dfB === 0 ? 0 : ssB / dfB;
    var msAB = dfAB === 0 ? 0 : ssAB / dfAB;
    var msError = dfError === 0 ? 0 : ssError / dfError;

    // F ratios
    var fA = msError === 0 ? 0 : msA / msError;
    var fB = msError === 0 ? 0 : msB / msError;
    var fAB = msError === 0 ? 0 : msAB / msError;

    // P-values
    var pA = dfError > 0 ? 1 - jStat.centralF.cdf(fA, dfA, dfError) : 1;
    var pB = dfError > 0 ? 1 - jStat.centralF.cdf(fB, dfB, dfError) : 1;
    var pAB = dfError > 0 ? 1 - jStat.centralF.cdf(fAB, dfAB, dfError) : 1;

    // Eta-squared
    var etaA = ssTotal === 0 ? 0 : ssA / ssTotal;
    var etaB = ssTotal === 0 ? 0 : ssB / ssTotal;
    var etaAB = ssTotal === 0 ? 0 : ssAB / ssTotal;

    return {
      test: "Two-way ANOVA",
      mainA: { F: fA, p: pA, df: dfA, ss: ssA, ms: msA, etaSquared: etaA },
      mainB: { F: fB, p: pB, df: dfB, ss: ssB, ms: msB, etaSquared: etaB },
      interaction: { F: fAB, p: pAB, df: dfAB, ss: ssAB, ms: msAB, etaSquared: etaAB },
      error: { df: dfError, ss: ssError, ms: msError },
      total: { df: dfTotal, ss: ssTotal },
      N: N,
      cellMeans: cellMeans,
      levelsA: levelsA,
      levelsB: levelsB
    };
  }

  /* ================================================================
   *  ANCOVA
   * ================================================================ */

  function ancova(y, group, covariate) {
    if (!y || !y.length || !group || !group.length || !covariate || !covariate.length) return { error: 'All inputs must be non-empty', valid: false };
    var N = y.length;

    // Dummy code the group variable
    var dc = dummyCode(group);
    var dummies = dc.dummies;
    var levels = dc.levels;

    // Full model: y ~ dummies + covariate
    var fullPredictors = dummies.slice();
    fullPredictors.push(covariate);
    var fullModel = linearRegression(y, fullPredictors);

    // Reduced model: y ~ covariate only
    var reducedModel = linearRegression(y, [covariate]);

    // F for group effect
    var ssReduced = reducedModel.SSE;
    var ssFull = fullModel.SSE;
    var dfDiff = dummies.length;
    var dfFull = N - dummies.length - 1 - 1; // N - total predictors - 1
    var msErrorFull = ssFull / dfFull;
    var F = msErrorFull === 0 ? 0 : ((ssReduced - ssFull) / dfDiff) / msErrorFull;
    var p = 1 - jStat.centralF.cdf(F, dfDiff, dfFull);

    // Covariate effect (last coefficient in full model)
    var covIdx = fullModel.coefficients.length - 1;
    var covariateEffect = {
      B: fullModel.coefficients[covIdx],
      t: fullModel.tStats[covIdx],
      p: fullModel.pValues[covIdx]
    };

    // Group stats (raw means)
    var groupStats = [];
    for (var g = 0; g < levels.length; g++) {
      var vals = [];
      for (var i = 0; i < N; i++) {
        if (group[i] === levels[g]) vals.push(y[i]);
      }
      groupStats.push({ group: levels[g], rawMean: mean(vals), n: vals.length });
    }

    // Adjusted means: predict y at the grand mean of covariate for each group
    var covMean = mean(covariate);
    var adjustedMeans = [];
    for (var g = 0; g < levels.length; g++) {
      var pred = fullModel.coefficients[0]; // intercept
      if (g > 0) {
        pred += fullModel.coefficients[g]; // dummy coefficient for this group
      }
      pred += fullModel.coefficients[covIdx] * covMean;
      adjustedMeans.push({ group: levels[g], adjustedMean: pred });
    }

    return {
      test: "ANCOVA",
      F: F,
      p: p,
      df1: dfDiff,
      df2: dfFull,
      adjustedMeans: adjustedMeans,
      covariateEffect: covariateEffect,
      rSquared: fullModel.R2,
      groupStats: groupStats,
      N: N
    };
  }

  /* ================================================================
   *  PARTIAL CORRELATION
   * ================================================================ */

  function partialCorrelation(x, y, controls) {
    if (!x || !y || !x.length || !y.length || !controls || !controls.length) return { error: 'All inputs must be non-empty', valid: false };
    var n = x.length;
    var nControls = controls.length;

    // Residualize x on controls
    var resX;
    if (nControls === 0) {
      resX = x.slice();
    } else {
      var regX = linearRegression(x, controls);
      resX = regX.residuals;
    }

    // Residualize y on controls
    var resY;
    if (nControls === 0) {
      resY = y.slice();
    } else {
      var regY = linearRegression(y, controls);
      resY = regY.residuals;
    }

    // Pearson correlation of residuals
    var mRX = mean(resX), mRY = mean(resY);
    var num = 0, dX = 0, dY = 0;
    for (var i = 0; i < n; i++) {
      num += (resX[i] - mRX) * (resY[i] - mRY);
      dX += (resX[i] - mRX) * (resX[i] - mRX);
      dY += (resY[i] - mRY) * (resY[i] - mRY);
    }
    var r = (dX === 0 || dY === 0) ? 0 : num / Math.sqrt(dX * dY);

    var df = n - 2 - nControls;
    var t = df > 0 ? r * Math.sqrt(df / (1 - r * r)) : 0;
    var p = df > 0 ? 2 * (1 - jStat.studentt.cdf(Math.abs(t), df)) : 1;

    // Fisher Z transform for CI
    var zr = 0.5 * Math.log((1 + r) / (1 - r));
    var seZ = (n - 3 - nControls) > 0 ? 1 / Math.sqrt(n - 3 - nControls) : Infinity;
    var zLo = zr - 1.96 * seZ;
    var zHi = zr + 1.96 * seZ;
    var ciLower = isFinite(seZ) ? (Math.exp(2 * zLo) - 1) / (Math.exp(2 * zLo) + 1) : -1;
    var ciUpper = isFinite(seZ) ? (Math.exp(2 * zHi) - 1) / (Math.exp(2 * zHi) + 1) : 1;

    return {
      test: "Partial Correlation",
      r: r,
      p: p,
      df: df,
      n: n,
      t: t,
      ci95: { lower: ciLower, upper: ciUpper }
    };
  }

  /* ================================================================
   *  MODERATION ANALYSIS
   * ================================================================ */

  function moderation(x, moderator, y) {
    if (!x || !moderator || !y || !x.length || !moderator.length || !y.length) return { error: 'All inputs must be non-empty', valid: false };
    var N = x.length;

    // Center x and moderator
    var mX = mean(x), mMod = mean(moderator);
    var sdMod = sd(moderator, 1);
    var xCentered = x.map(function(v) { return v - mX; });
    var modCentered = moderator.map(function(v) { return v - mMod; });

    // Interaction term
    var interaction = [];
    for (var i = 0; i < N; i++) {
      interaction.push(xCentered[i] * modCentered[i]);
    }

    // Full model: y ~ x_centered + mod_centered + interaction
    var fullModel = linearRegression(y, [xCentered, modCentered, interaction]);

    // Model without interaction: y ~ x_centered + mod_centered
    var reducedModel = linearRegression(y, [xCentered, modCentered]);

    var rSquaredChange = fullModel.R2 - reducedModel.R2;

    // Coefficients with names
    var coefNames = ["intercept", "x", "moderator", "interaction"];
    var coefficients = [];
    for (var i = 0; i < fullModel.coefficients.length; i++) {
      coefficients.push({
        name: coefNames[i],
        B: fullModel.coefficients[i],
        se: fullModel.se[i],
        t: fullModel.tStats[i],
        p: fullModel.pValues[i]
      });
    }

    // Interaction effect
    var interactionEffect = {
      B: fullModel.coefficients[3],
      se: fullModel.se[3],
      t: fullModel.tStats[3],
      p: fullModel.pValues[3],
      significant: fullModel.pValues[3] < 0.05
    };

    // Simple slopes at moderator mean +/- 1 SD
    var b1 = fullModel.coefficients[1];
    var b3 = fullModel.coefficients[3];

    // Variance-covariance matrix of betas
    var XtXinv = invertMatrix(
      (function() {
        var predictors = [xCentered, modCentered, interaction];
        var nPred = predictors.length;
        var cols = nPred + 1;
        var X = [];
        for (var i = 0; i < N; i++) {
          var row = [1];
          for (var j = 0; j < nPred; j++) row.push(predictors[j][i]);
          X.push(row);
        }
        var XtX = [];
        for (var ii = 0; ii < cols; ii++) {
          XtX.push([]);
          for (var jj = 0; jj < cols; jj++) {
            var s = 0;
            for (var kk = 0; kk < N; kk++) s += X[kk][ii] * X[kk][jj];
            XtX[ii].push(s);
          }
        }
        return XtX;
      })()
    );

    var MSE = fullModel.MSE;
    var dfSimple = N - 4;

    // Simple slope at low moderator (mean - 1 SD)
    var slopeLow = b1 + b3 * (-sdMod);
    var seLow = 0;
    if (XtXinv) {
      var varB1 = MSE * XtXinv[1][1];
      var varB3 = MSE * XtXinv[3][3];
      var covB1B3 = MSE * XtXinv[1][3];
      seLow = Math.sqrt(varB1 + sdMod * sdMod * varB3 + 2 * (-sdMod) * covB1B3);
    }
    var tLow = seLow === 0 ? 0 : slopeLow / seLow;
    var pLow = dfSimple > 0 ? 2 * (1 - jStat.studentt.cdf(Math.abs(tLow), dfSimple)) : 1;

    // Simple slope at high moderator (mean + 1 SD)
    var slopeHigh = b1 + b3 * sdMod;
    var seHigh = 0;
    if (XtXinv) {
      var varB1h = MSE * XtXinv[1][1];
      var varB3h = MSE * XtXinv[3][3];
      var covB1B3h = MSE * XtXinv[1][3];
      seHigh = Math.sqrt(varB1h + sdMod * sdMod * varB3h + 2 * sdMod * covB1B3h);
    }
    var tHigh = seHigh === 0 ? 0 : slopeHigh / seHigh;
    var pHigh = dfSimple > 0 ? 2 * (1 - jStat.studentt.cdf(Math.abs(tHigh), dfSimple)) : 1;

    return {
      test: "Moderation Analysis",
      rSquared: fullModel.R2,
      rSquaredChange: rSquaredChange,
      F: fullModel.F,
      p: fullModel.fP,
      coefficients: coefficients,
      interactionEffect: interactionEffect,
      N: N,
      simpleSlopes: {
        lowMod: { slope: slopeLow, se: seLow, t: tLow, p: pLow },
        highMod: { slope: slopeHigh, se: seHigh, t: tHigh, p: pHigh }
      }
    };
  }

  /* ================================================================
   *  DIFFERENCE-IN-DIFFERENCES
   * ================================================================ */

  function diffInDiff(y, treatment, post) {
    if (!y || !treatment || !post || !y.length || !treatment.length || !post.length) return { error: 'All inputs must be non-empty', valid: false };
    var N = y.length;

    // Create interaction term
    var interaction = [];
    for (var i = 0; i < N; i++) {
      interaction.push(treatment[i] * post[i]);
    }

    // OLS: y = b0 + b1*treatment + b2*post + b3*(treatment*post)
    var result = linearRegression(y, [treatment, post, interaction]);

    // Group means
    var controlPre = [], controlPost = [], treatPre = [], treatPost = [];
    for (var i = 0; i < N; i++) {
      if (treatment[i] === 0 && post[i] === 0) controlPre.push(y[i]);
      else if (treatment[i] === 0 && post[i] === 1) controlPost.push(y[i]);
      else if (treatment[i] === 1 && post[i] === 0) treatPre.push(y[i]);
      else treatPost.push(y[i]);
    }

    var coefNames = ["intercept", "treatment", "post", "treatment*post (DiD)"];
    var coefficients = [];
    for (var i = 0; i < result.coefficients.length; i++) {
      coefficients.push({
        name: coefNames[i],
        B: result.coefficients[i],
        se: result.se[i],
        t: result.tStats[i],
        p: result.pValues[i]
      });
    }

    return {
      test: "Difference-in-Differences",
      didEstimate: result.coefficients[3],
      didSE: result.se[3],
      didT: result.tStats[3],
      didP: result.pValues[3],
      coefficients: coefficients,
      rSquared: result.R2,
      F: result.F,
      pModel: result.fP,
      N: N,
      groupMeans: {
        controlPre: controlPre.length > 0 ? mean(controlPre) : NaN,
        controlPost: controlPost.length > 0 ? mean(controlPost) : NaN,
        treatPre: treatPre.length > 0 ? mean(treatPre) : NaN,
        treatPost: treatPost.length > 0 ? mean(treatPost) : NaN
      }
    };
  }

  /* ================================================================
   *  POISSON REGRESSION  (IRLS with log link)
   * ================================================================ */

  function poissonRegression(y, xs, options) {
    if (!options) options = {};
    var maxIter = options.maxIter || 25;
    var tol = options.tol || 1e-8;

    if (xs.length > 0 && typeof xs[0] === "number") {
      xs = [xs];
    }

    var n = y.length;
    var p = xs.length;
    var cols = p + 1;

    // Design matrix with intercept
    var X = [];
    for (var i = 0; i < n; i++) {
      var row = [1];
      for (var j = 0; j < p; j++) row.push(xs[j][i]);
      X.push(row);
    }

    // Initialize betas to 0
    var beta = new Array(cols);
    for (var j = 0; j < cols; j++) beta[j] = 0;

    var converged = false;
    var iter;

    for (iter = 0; iter < maxIter; iter++) {
      // Compute mu = exp(X*beta)
      var mu = [];
      for (var i = 0; i < n; i++) {
        var eta = 0;
        for (var j = 0; j < cols; j++) eta += beta[j] * X[i][j];
        mu.push(Math.exp(eta));
      }

      // Working weights W = diag(mu), working response z = eta + (y - mu)/mu
      var W = [];
      var z = [];
      for (var i = 0; i < n; i++) {
        var w = Math.max(mu[i], 1e-10);
        W.push(w);
        var eta = 0;
        for (var j = 0; j < cols; j++) eta += beta[j] * X[i][j];
        z.push(eta + (y[i] - mu[i]) / w);
      }

      // X'WX
      var XtWX = [];
      for (var a = 0; a < cols; a++) {
        XtWX.push([]);
        for (var b = 0; b < cols; b++) {
          var s = 0;
          for (var i = 0; i < n; i++) s += X[i][a] * W[i] * X[i][b];
          XtWX[a].push(s);
        }
      }

      // X'Wz
      var XtWz = [];
      for (var a = 0; a < cols; a++) {
        var s = 0;
        for (var i = 0; i < n; i++) s += X[i][a] * W[i] * z[i];
        XtWz.push(s);
      }

      // Solve for new beta: beta_new = (X'WX)^-1 X'Wz
      var betaNew = solveLinearSystem(XtWX, XtWz);
      if (!betaNew) break;

      var maxDelta = 0;
      for (var j = 0; j < cols; j++) {
        if (Math.abs(betaNew[j] - beta[j]) > maxDelta) maxDelta = Math.abs(betaNew[j] - beta[j]);
      }
      beta = betaNew;

      if (maxDelta < tol) { converged = true; break; }
    }

    // Final mu
    var muFinal = [];
    var logLik = 0;
    for (var i = 0; i < n; i++) {
      var eta = 0;
      for (var j = 0; j < cols; j++) eta += beta[j] * X[i][j];
      var m = Math.exp(eta);
      muFinal.push(m);
      logLik += y[i] * Math.log(m + 1e-15) - m - Math.log(factorial(y[i]) || 1);
    }

    // Null model: intercept only
    var yBar = mean(y);
    var logLikNull = 0;
    for (var i = 0; i < n; i++) {
      logLikNull += y[i] * Math.log(yBar + 1e-15) - yBar - Math.log(factorial(y[i]) || 1);
    }

    var deviance = -2 * logLik;
    var nullDeviance = -2 * logLikNull;
    var pseudoR2 = nullDeviance === 0 ? 0 : 1 - deviance / nullDeviance;

    // Standard errors from (X'WX)^-1
    var WFinal = muFinal.map(function (m) { return Math.max(m, 1e-10); });
    var H = [];
    for (var a = 0; a < cols; a++) {
      H.push([]);
      for (var b = 0; b < cols; b++) {
        var s = 0;
        for (var i = 0; i < n; i++) s += X[i][a] * WFinal[i] * X[i][b];
        H[a].push(s);
      }
    }
    var Hinv = invertMatrix(H);

    var coefficients = [];
    var coefNames = ["intercept"];
    for (var j = 0; j < p; j++) coefNames.push("x" + (j + 1));

    for (var j = 0; j < cols; j++) {
      var sej = Hinv ? Math.sqrt(Math.abs(Hinv[j][j])) : NaN;
      var zj = sej ? beta[j] / sej : 0;
      var pj = 2 * (1 - jStat.normal.cdf(Math.abs(zj), 0, 1));
      coefficients.push({
        name: coefNames[j],
        B: beta[j],
        se: sej,
        z: zj,
        p: pj,
        expB: Math.exp(beta[j])
      });
    }

    var AIC = -2 * logLik + 2 * cols;
    var BIC = -2 * logLik + Math.log(n) * cols;

    return {
      test: "Poisson Regression (IRLS)",
      coefficients: coefficients,
      deviance: deviance,
      nullDeviance: nullDeviance,
      pseudoR2: pseudoR2,
      aic: AIC,
      bic: BIC,
      N: n,
      converged: converged,
      iterations: iter + 1,
      df: n - cols
    };
  }

  /* ================================================================
   *  MEDIATION ANALYSIS  (Baron & Kenny + Sobel test)
   * ================================================================ */

  function mediation(x, mediator, y) {
    if (!x || !mediator || !y || !x.length || !mediator.length || !y.length) return { error: 'All inputs must be non-empty', valid: false };
    var n = x.length;

    // Path c (total): regress y on x
    var regC = linearRegression(y, [x]);
    var c = regC.coefficients[1];
    var se_c = regC.se[1];
    var t_c = regC.tStats[1];
    var p_c = regC.pValues[1];

    // Path a: regress mediator on x
    var regA = linearRegression(mediator, [x]);
    var a = regA.coefficients[1];
    var se_a = regA.se[1];
    var t_a = regA.tStats[1];
    var p_a = regA.pValues[1];

    // Path b + c': regress y on [x, mediator]
    var regBC = linearRegression(y, [x, mediator]);
    var cPrime = regBC.coefficients[1]; // direct effect
    var se_cPrime = regBC.se[1];
    var t_cPrime = regBC.tStats[1];
    var p_cPrime = regBC.pValues[1];
    var b = regBC.coefficients[2]; // mediator effect
    var se_b = regBC.se[2];
    var t_b = regBC.tStats[2];
    var p_b = regBC.pValues[2];

    // Indirect effect = a * b
    var indirectEffect = a * b;

    // Sobel test
    var sobelSE = Math.sqrt(a * a * se_b * se_b + b * b * se_a * se_a);
    var sobelZ = sobelSE === 0 ? 0 : indirectEffect / sobelSE;
    var sobelP = 2 * (1 - jStat.normal.cdf(Math.abs(sobelZ), 0, 1));

    // Proportion mediated
    var proportionMediated = c === 0 ? 0 : indirectEffect / c;

    return {
      test: "Mediation Analysis (Baron & Kenny + Sobel)",
      pathA: { B: a, se: se_a, t: t_a, p: p_a },
      pathB: { B: b, se: se_b, t: t_b, p: p_b },
      pathC: { B: c, se: se_c, t: t_c, p: p_c },
      pathCprime: { B: cPrime, se: se_cPrime, t: t_cPrime, p: p_cPrime },
      indirectEffect: indirectEffect,
      sobelSE: sobelSE,
      sobelZ: sobelZ,
      sobelP: sobelP,
      proportionMediated: proportionMediated,
      totalEffect: c,
      directEffect: cPrime,
      N: n
    };
  }

  /* ================================================================
   *  HIERARCHICAL CLUSTERING  (Agglomerative, bottom-up)
   * ================================================================ */

  function hierarchicalClustering(data, linkage) {
    if (!linkage) linkage = "average";

    var nVars = data.length;
    var n = data[0].length;

    // Build observation matrix (n x nVars)
    var obs = [];
    for (var i = 0; i < n; i++) {
      var row = [];
      for (var j = 0; j < nVars; j++) row.push(data[j][i]);
      obs.push(row);
    }

    // Initialize clusters: each observation is its own cluster
    var clusters = [];
    for (var i = 0; i < n; i++) {
      clusters.push({ members: [i], active: true });
    }

    // Compute initial distance matrix (n x n)
    var dist = [];
    for (var i = 0; i < n; i++) {
      dist.push([]);
      for (var j = 0; j < n; j++) {
        dist[i].push(i === j ? Infinity : euclidean(obs[i], obs[j]));
      }
    }

    var merges = [];
    var heights = [];

    for (var step = 0; step < n - 1; step++) {
      // Find the two closest active clusters
      var minDist = Infinity;
      var ci = -1, cj = -1;
      for (var i = 0; i < clusters.length; i++) {
        if (!clusters[i].active) continue;
        for (var j = i + 1; j < clusters.length; j++) {
          if (!clusters[j].active) continue;
          if (dist[i][j] < minDist) {
            minDist = dist[i][j];
            ci = i;
            cj = j;
          }
        }
      }

      // Record merge
      var newSize = clusters[ci].members.length + clusters[cj].members.length;
      merges.push({ i: ci, j: cj, distance: minDist, size: newSize });
      heights.push(minDist);

      // Merge cj into ci
      var mergedMembers = clusters[ci].members.concat(clusters[cj].members);
      clusters[cj].active = false;

      // Update distances from new cluster (ci) to all other active clusters
      for (var k = 0; k < clusters.length; k++) {
        if (!clusters[k].active || k === ci) continue;

        var newDist;
        if (linkage === "single") {
          newDist = Math.min(dist[ci][k], dist[cj][k]);
        } else if (linkage === "complete") {
          newDist = Math.max(dist[ci][k], dist[cj][k]);
        } else {
          // average (UPGMA)
          var ni = clusters[ci].members.length;
          var nj = clusters[cj].members.length;
          newDist = (dist[ci][k] * ni + dist[cj][k] * nj) / (ni + nj);
        }

        dist[ci][k] = newDist;
        dist[k][ci] = newDist;
      }

      clusters[ci].members = mergedMembers;
    }

    // cutTree helper: produce cluster assignments for k clusters
    function cutTree(k) {
      if (k < 1) k = 1;
      if (k > n) k = n;

      // Start with each obs in its own cluster
      var assignments = new Array(n);
      for (var i = 0; i < n; i++) assignments[i] = i;

      // Replay merges up to n - k merges
      var numMerges = n - k;
      // Re-build from scratch using union-find style
      var parent = new Array(n);
      for (var i = 0; i < n; i++) parent[i] = i;

      function find(x) {
        while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
        return x;
      }

      // Re-compute merges by replaying the merge order
      // Re-initialize clusters for replay
      var replayClusters = [];
      for (var i = 0; i < n; i++) {
        replayClusters.push({ members: [i], active: true });
      }

      var replayDist = [];
      for (var i = 0; i < n; i++) {
        replayDist.push([]);
        for (var j = 0; j < n; j++) {
          replayDist[i].push(i === j ? Infinity : euclidean(obs[i], obs[j]));
        }
      }

      for (var step = 0; step < numMerges; step++) {
        // Find closest
        var minD = Infinity;
        var mi = -1, mj = -1;
        for (var i = 0; i < replayClusters.length; i++) {
          if (!replayClusters[i].active) continue;
          for (var j = i + 1; j < replayClusters.length; j++) {
            if (!replayClusters[j].active) continue;
            if (replayDist[i][j] < minD) {
              minD = replayDist[i][j];
              mi = i;
              mj = j;
            }
          }
        }

        var mergedMem = replayClusters[mi].members.concat(replayClusters[mj].members);
        replayClusters[mj].active = false;

        for (var kk = 0; kk < replayClusters.length; kk++) {
          if (!replayClusters[kk].active || kk === mi) continue;
          var nd;
          if (linkage === "single") {
            nd = Math.min(replayDist[mi][kk], replayDist[mj][kk]);
          } else if (linkage === "complete") {
            nd = Math.max(replayDist[mi][kk], replayDist[mj][kk]);
          } else {
            var nni = replayClusters[mi].members.length;
            var nnj = replayClusters[mj].members.length;
            nd = (replayDist[mi][kk] * nni + replayDist[mj][kk] * nnj) / (nni + nnj);
          }
          replayDist[mi][kk] = nd;
          replayDist[kk][mi] = nd;
        }

        replayClusters[mi].members = mergedMem;
      }

      // Assign labels based on remaining active clusters
      var label = 0;
      for (var i = 0; i < replayClusters.length; i++) {
        if (!replayClusters[i].active) continue;
        for (var m = 0; m < replayClusters[i].members.length; m++) {
          assignments[replayClusters[i].members[m]] = label;
        }
        label++;
      }

      return assignments;
    }

    // Precompute labels for k = 2..sqrt(n)
    var maxK = Math.max(2, Math.floor(Math.sqrt(n)));
    var labels = {};
    for (var k = 2; k <= maxK; k++) {
      labels[k] = cutTree(k);
    }

    return {
      test: "Hierarchical Clustering",
      merges: merges,
      labels: labels,
      heights: heights,
      n: n,
      dendrogram: merges,
      cutTree: cutTree
    };
  }

  /* ================================================================
   *  SENTIMENT ANALYSIS  (AFINN-style lexicon scoring)
   * ================================================================ */

  var SENTIMENT_LEXICON = {
    // Positive words
    good: 3, great: 4, excellent: 5, love: 3, amazing: 4, perfect: 5, wonderful: 4, fantastic: 4,
    happy: 3, easy: 2, helpful: 2, nice: 2, best: 4, beautiful: 3, enjoy: 2, satisfied: 2,
    recommend: 3, impressive: 3, outstanding: 5, brilliant: 4, superb: 5, awesome: 4, delightful: 3,
    pleasant: 2, terrific: 4, exceptional: 5, marvelous: 4, superior: 3, remarkable: 3, favorable: 2,
    positive: 2, glad: 3, pleased: 3, grateful: 3, thankful: 3, reliable: 2, efficient: 2,
    smooth: 2, clean: 2, fast: 2, friendly: 3, warm: 2, generous: 3, innovative: 3, elegant: 3,
    intuitive: 3, seamless: 3, comfortable: 2, convenient: 2, exciting: 3, valuable: 3,
    // Negative words
    bad: -3, terrible: -5, awful: -4, hate: -4, poor: -3, worst: -5, horrible: -4, ugly: -3,
    difficult: -2, confusing: -2, broken: -3, slow: -2, annoying: -3, frustrating: -3, useless: -4,
    disappointing: -3, expensive: -2, complicated: -2, boring: -2, weak: -2, dreadful: -4,
    pathetic: -4, disgusting: -4, painful: -3, unpleasant: -2, inferior: -3, unreliable: -3,
    negative: -2, angry: -3, upset: -3, dissatisfied: -3, unhappy: -3, rude: -3, hostile: -3,
    clumsy: -2, dirty: -2, faulty: -3, flawed: -2, mediocre: -2, lousy: -3, miserable: -4,
    offensive: -3, ridiculous: -3, terrible: -5, wasteful: -2, worthless: -4, wrong: -2,
    // Neutral / mild
    okay: 1, fine: 1, average: 0, decent: 1, fair: 0, neutral: 0, adequate: 0, acceptable: 1,
    standard: 0, typical: 0, normal: 0, moderate: 0, ordinary: 0, reasonable: 1, sufficient: 1,
    // Additional common survey words
    improve: 2, improvement: 2, support: 2, quality: 2, simple: 2, effective: 3,
    problem: -2, issue: -2, concern: -2, complaint: -3, error: -3, fail: -4, failure: -4,
    bug: -3, crash: -4, lag: -2, glitch: -3, delay: -2, lack: -2, missing: -2,
    excellent: 5, success: 3, successful: 3, benefit: 2, advantage: 2, strength: 2,
    weakness: -2, risk: -2, threat: -3, damage: -3, loss: -3, decline: -2, decrease: -1,
    increase: 1, growth: 2, progress: 2, achieve: 3, accomplish: 3, win: 3, gain: 2
  };

  function sentiment(texts) {
    var scores = [];
    var distribution = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
    var wordHits = {}; // word -> { count, score }
    var totalTexts = texts.length;
    var scoredTexts = 0;
    var totalWordsScored = 0;

    for (var t = 0; t < texts.length; t++) {
      var raw = String(texts[t]).toLowerCase().replace(/[^a-z\s]/g, " ");
      var tokens = raw.split(/\s+/).filter(function (w) { return w.length > 0; });

      var textScore = 0;
      var scoredCount = 0;

      for (var i = 0; i < tokens.length; i++) {
        var word = tokens[i];
        if (SENTIMENT_LEXICON.hasOwnProperty(word)) {
          var ws = SENTIMENT_LEXICON[word];
          textScore += ws;
          scoredCount++;

          if (!wordHits[word]) wordHits[word] = { count: 0, score: ws };
          wordHits[word].count++;
        }
      }

      var normalized = scoredCount > 0 ? textScore / scoredCount : 0;
      scores.push(normalized);

      if (scoredCount > 0) {
        scoredTexts++;
        totalWordsScored += scoredCount;
      }

      // Classify
      if (normalized > 0.5) distribution.positive++;
      else if (normalized < -0.5) distribution.negative++;
      else distribution.neutral++;
    }

    // Top positive and negative words
    var wordKeys = Object.keys(wordHits);
    var positiveWords = wordKeys
      .filter(function (w) { return wordHits[w].score > 0; })
      .map(function (w) { return { word: w, count: wordHits[w].count, score: wordHits[w].score }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 10);

    var negativeWords = wordKeys
      .filter(function (w) { return wordHits[w].score < 0; })
      .map(function (w) { return { word: w, count: wordHits[w].count, score: wordHits[w].score }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 10);

    var meanScore = scores.length > 0 ? mean(scores) : 0;

    return {
      test: "Sentiment Analysis",
      meanScore: meanScore,
      scores: scores,
      distribution: distribution,
      topPositiveWords: positiveWords,
      topNegativeWords: negativeWords,
      totalTexts: totalTexts,
      scoredTexts: scoredTexts,
      avgWordsScored: scoredTexts > 0 ? totalWordsScored / scoredTexts : 0
    };
  }

  /* ================================================================
   *  POST-STRATIFICATION WEIGHTING
   * ================================================================ */

  function postStratWeighting(strata, targetProportions) {
    var n = strata.length;

    // Count sample proportions per stratum
    var stratumCounts = {};
    for (var i = 0; i < n; i++) {
      var s = String(strata[i]);
      stratumCounts[s] = (stratumCounts[s] || 0) + 1;
    }

    // Compute weights
    var weights = new Array(n);
    var stratumStats = [];
    var stratumWeights = {};

    var strataKeys = Object.keys(targetProportions);
    for (var k = 0; k < strataKeys.length; k++) {
      var s = strataKeys[k];
      var sampleN = stratumCounts[s] || 0;
      var samplePct = sampleN / n;
      var targetPct = targetProportions[s];
      var w = samplePct === 0 ? 0 : targetPct / samplePct;
      stratumWeights[s] = w;

      stratumStats.push({
        stratum: s,
        sampleN: sampleN,
        samplePct: samplePct,
        targetPct: targetPct,
        weight: w,
        effectiveN: sampleN * w
      });
    }

    // Assign weights to each respondent
    for (var i = 0; i < n; i++) {
      var s = String(strata[i]);
      weights[i] = stratumWeights[s] || 1;
    }

    // Normalize so weights sum to n
    var wSum = 0;
    for (var i = 0; i < n; i++) wSum += weights[i];
    if (wSum > 0) {
      for (var i = 0; i < n; i++) weights[i] = weights[i] * n / wSum;
    }

    // Recompute stats after normalization
    stratumWeights = {};
    for (var i = 0; i < n; i++) {
      var s = String(strata[i]);
      stratumWeights[s] = weights[i]; // all respondents in same stratum have same weight
    }
    for (var k = 0; k < stratumStats.length; k++) {
      stratumStats[k].weight = stratumWeights[stratumStats[k].stratum] || 1;
      stratumStats[k].effectiveN = stratumStats[k].sampleN * stratumStats[k].weight;
    }

    // Weight CV and design effect
    var wMean = mean(weights);
    var wVar = variance(weights, 1);
    var wCV = wMean === 0 ? 0 : Math.sqrt(wVar) / wMean;
    var designEffect = 1 + wCV * wCV;
    var effectiveSampleSize = n / designEffect;

    var maxWeight = weights[0], minWeight = weights[0];
    for (var i = 1; i < n; i++) {
      if (weights[i] > maxWeight) maxWeight = weights[i];
      if (weights[i] < minWeight) minWeight = weights[i];
    }

    return {
      test: "Post-Stratification Weighting",
      weights: weights,
      stratumStats: stratumStats,
      n: n,
      designEffect: designEffect,
      effectiveSampleSize: effectiveSampleSize,
      maxWeight: maxWeight,
      minWeight: minWeight,
      weightCV: wCV
    };
  }

  /* ================================================================
   *  PROPENSITY SCORE MATCHING
   * ================================================================ */

  function propensityScoreMatching(treatment, covariates, outcome) {
    var n = treatment.length;

    if (covariates.length > 0 && typeof covariates[0] === "number") {
      covariates = [covariates];
    }

    var nCovariates = covariates.length;

    // Fit logistic regression: treatment ~ covariates
    var logit = logisticRegression(treatment, covariates);
    var propensityScores = logit.predicted;

    // Separate treated and control indices
    var treatedIdx = [];
    var controlIdx = [];
    for (var i = 0; i < n; i++) {
      if (treatment[i] === 1) treatedIdx.push(i);
      else controlIdx.push(i);
    }

    // Match: for each treated, find nearest control (without replacement)
    var matchedPairs = [];
    var usedControls = {};
    var unmatchedTreated = 0;

    // Sort treated by propensity score to improve matching
    treatedIdx.sort(function (a, b) { return propensityScores[a] - propensityScores[b]; });

    for (var t = 0; t < treatedIdx.length; t++) {
      var ti = treatedIdx[t];
      var bestControl = -1;
      var bestDist = Infinity;

      for (var c = 0; c < controlIdx.length; c++) {
        var ci = controlIdx[c];
        if (usedControls[ci]) continue;
        var d = Math.abs(propensityScores[ti] - propensityScores[ci]);
        if (d < bestDist) {
          bestDist = d;
          bestControl = ci;
        }
      }

      if (bestControl >= 0) {
        matchedPairs.push({ treated: ti, control: bestControl, distance: bestDist });
        usedControls[bestControl] = true;
      } else {
        unmatchedTreated++;
      }
    }

    // Balance assessment: standardized mean difference before and after matching
    var balanceBefore = [];
    var balanceAfter = [];

    for (var j = 0; j < nCovariates; j++) {
      // Before matching: all treated vs all control
      var treatedVals = [];
      var controlVals = [];
      for (var i = 0; i < n; i++) {
        if (treatment[i] === 1) treatedVals.push(covariates[j][i]);
        else controlVals.push(covariates[j][i]);
      }
      var pooledSDBefore = Math.sqrt((variance(treatedVals, 1) + variance(controlVals, 1)) / 2);
      var smdBefore = pooledSDBefore === 0 ? 0 : (mean(treatedVals) - mean(controlVals)) / pooledSDBefore;
      balanceBefore.push({ covariate: j, smdBefore: smdBefore });

      // After matching: matched treated vs matched control
      var matchedTreatedVals = [];
      var matchedControlVals = [];
      for (var m = 0; m < matchedPairs.length; m++) {
        matchedTreatedVals.push(covariates[j][matchedPairs[m].treated]);
        matchedControlVals.push(covariates[j][matchedPairs[m].control]);
      }
      var pooledSDAfter = matchedTreatedVals.length > 1
        ? Math.sqrt((variance(matchedTreatedVals, 1) + variance(matchedControlVals, 1)) / 2)
        : 0;
      var smdAfter = pooledSDAfter === 0 ? 0 : (mean(matchedTreatedVals) - mean(matchedControlVals)) / pooledSDAfter;
      balanceAfter.push({ covariate: j, smdAfter: smdAfter });
    }

    var result = {
      test: "Propensity Score Matching",
      propensityScores: propensityScores,
      matchedPairs: matchedPairs,
      nTreated: treatedIdx.length,
      nControl: controlIdx.length,
      nMatched: matchedPairs.length,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      unmatchedTreated: unmatchedTreated
    };

    // If outcome provided, compute ATT
    if (outcome) {
      var yTreated = [];
      var yControl = [];
      for (var m = 0; m < matchedPairs.length; m++) {
        yTreated.push(outcome[matchedPairs[m].treated]);
        yControl.push(outcome[matchedPairs[m].control]);
      }
      var attEstimate = mean(yTreated) - mean(yControl);
      var diffs = [];
      for (var m = 0; m < matchedPairs.length; m++) {
        diffs.push(yTreated[m] - yControl[m]);
      }
      var attSE = matchedPairs.length > 1 ? sd(diffs, 1) / Math.sqrt(matchedPairs.length) : 0;
      var attT = attSE === 0 ? 0 : attEstimate / attSE;
      var attDF = matchedPairs.length - 1;
      var attP = attDF > 0 ? 2 * (1 - jStat.studentt.cdf(Math.abs(attT), attDF)) : 1;

      result.att = {
        estimate: attEstimate,
        se: attSE,
        t: attT,
        p: attP
      };
    }

    return result;
  }

  /* ================================================================
   *  MULTINOMIAL LOGISTIC REGRESSION  (one-vs-rest)
   * ================================================================ */

  function multinomialLogistic(y, xs) {
    if (!y || !y.length || !xs || !xs.length) return { error: 'All inputs must be non-empty', valid: false };
    if (xs.length > 0 && typeof xs[0] === "number") {
      xs = [xs];
    }

    var n = y.length;
    var k = xs.length;

    // Get unique categories
    var categories = [];
    for (var i = 0; i < n; i++) {
      if (categories.indexOf(y[i]) === -1) categories.push(y[i]);
    }
    categories.sort();
    if (categories.length < 3) return { error: "multinomialLogistic requires 3+ categories", valid: false };

    var reference = categories[0];
    var nonRef = categories.slice(1);

    // One-vs-rest: for each non-reference category, fit binary logistic regression
    var models = [];
    var allProbs = []; // allProbs[i][j] = raw prob for observation i, category j

    // Initialize probability matrix
    for (var i = 0; i < n; i++) allProbs.push(new Array(categories.length));

    for (var c = 0; c < nonRef.length; c++) {
      var binaryY = [];
      for (var i = 0; i < n; i++) {
        binaryY.push(y[i] === nonRef[c] ? 1 : 0);
      }
      var res = logisticRegression(binaryY, xs);
      models.push({
        category: nonRef[c],
        coefficients: res.coefficients,
        se: res.se,
        zStats: res.zStats,
        pValues: res.pValues,
        oddsRatios: res.oddsRatios,
        converged: res.converged
      });
      for (var i = 0; i < n; i++) {
        allProbs[i][c + 1] = res.predicted[i];
      }
    }

    // Normalize probabilities across categories for each observation
    var predictions = [];
    var correct = 0;
    for (var i = 0; i < n; i++) {
      // Reference category gets the complement
      var sumNonRef = 0;
      for (var c = 1; c < categories.length; c++) sumNonRef += allProbs[i][c];
      // Normalize: divide each by total
      var total = 1 + sumNonRef; // 1 for reference baseline
      allProbs[i][0] = 1 / total;
      for (var c = 1; c < categories.length; c++) {
        allProbs[i][c] = allProbs[i][c] / total;
      }

      // Predicted class = category with highest probability
      var maxP = 0;
      var maxIdx = 0;
      for (var c = 0; c < categories.length; c++) {
        if (allProbs[i][c] > maxP) { maxP = allProbs[i][c]; maxIdx = c; }
      }
      predictions.push(categories[maxIdx]);
      if (predictions[i] === y[i]) correct++;
    }

    return {
      test: "Multinomial Logistic Regression (One-vs-Rest)",
      categories: categories,
      reference: reference,
      models: models,
      predictions: predictions,
      probabilities: allProbs,
      accuracy: correct / n,
      N: n,
      k: k
    };
  }

  /* ================================================================
   *  ORDINAL REGRESSION  (cumulative logit / proportional odds)
   * ================================================================ */

  function ordinalRegression(y, xs) {
    if (xs.length > 0 && typeof xs[0] === "number") {
      xs = [xs];
    }

    var n = y.length;
    var p = xs.length;

    // Get sorted unique levels
    var levels = [];
    for (var i = 0; i < n; i++) {
      if (levels.indexOf(y[i]) === -1) levels.push(y[i]);
    }
    levels.sort(function (a, b) { return a - b; });
    var K = levels.length; // number of ordinal levels
    var nThresh = K - 1; // K-1 thresholds
    var nParams = nThresh + p; // total parameters

    // Map y to level indices (0..K-1)
    var yIdx = [];
    for (var i = 0; i < n; i++) {
      yIdx.push(levels.indexOf(y[i]));
    }

    // Build design matrix (no intercept — thresholds act as intercepts)
    var X = [];
    for (var i = 0; i < n; i++) {
      var row = [];
      for (var j = 0; j < p; j++) row.push(xs[j][i]);
      X.push(row);
    }

    // Initialize parameters: thresholds evenly spaced, betas = 0
    var params = new Array(nParams);
    for (var t = 0; t < nThresh; t++) {
      params[t] = -2 + (4 * t) / Math.max(nThresh - 1, 1);
    }
    for (var j = 0; j < p; j++) params[nThresh + j] = 0;

    function sigmoid(z) { return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z)))); }

    // Cumulative probability P(Y <= k | X) = sigmoid(alpha_k - X*beta)
    function cumProb(obs, k, par) {
      if (k < 0) return 0;
      if (k >= nThresh) return 1;
      var eta = par[k];
      for (var j = 0; j < p; j++) eta -= par[nThresh + j] * X[obs][j];
      return sigmoid(eta);
    }

    function catProb(obs, k, par) {
      return cumProb(obs, k, par) - cumProb(obs, k - 1, par);
    }

    function logLikelihood(par) {
      var ll = 0;
      for (var i = 0; i < n; i++) {
        var pk = catProb(i, yIdx[i], par);
        if (pk < 1e-15) pk = 1e-15;
        ll += Math.log(pk);
      }
      return ll;
    }

    // Newton-Raphson optimization
    var maxIter = 50;
    var tol = 1e-6;
    var converged = false;

    for (var iter = 0; iter < maxIter; iter++) {
      // Compute gradient and Hessian numerically
      var grad = new Array(nParams);
      var hess = [];
      for (var a = 0; a < nParams; a++) {
        hess.push(new Array(nParams));
      }

      var eps = 1e-5;
      var ll0 = logLikelihood(params);

      // Gradient by central differences
      for (var a = 0; a < nParams; a++) {
        params[a] += eps;
        var llp = logLikelihood(params);
        params[a] -= 2 * eps;
        var llm = logLikelihood(params);
        params[a] += eps;
        grad[a] = (llp - llm) / (2 * eps);
      }

      // Hessian by finite differences of gradient
      for (var a = 0; a < nParams; a++) {
        for (var b = a; b < nParams; b++) {
          params[b] += eps;
          // Recompute gradient[a]
          params[a] += eps;
          var f1 = logLikelihood(params);
          params[a] -= 2 * eps;
          var f2 = logLikelihood(params);
          params[a] += eps;
          var g1 = (f1 - f2) / (2 * eps);

          params[b] -= 2 * eps;
          params[a] += eps;
          var f3 = logLikelihood(params);
          params[a] -= 2 * eps;
          var f4 = logLikelihood(params);
          params[a] += eps;
          var g2 = (f3 - f4) / (2 * eps);

          params[b] += eps; // restore
          hess[a][b] = (g1 - g2) / (2 * eps);
          hess[b][a] = hess[a][b];
        }
      }

      // Solve: delta = -H^-1 * g
      var negGrad = grad.map(function (g) { return -g; });
      var negHess = [];
      for (var a = 0; a < nParams; a++) {
        negHess.push([]);
        for (var b = 0; b < nParams; b++) {
          negHess[a].push(-hess[a][b]);
        }
      }

      var delta = solveLinearSystem(negHess, negGrad);
      if (!delta) break;

      var maxDelta = 0;
      for (var a = 0; a < nParams; a++) {
        // Dampen step if too large
        var step = Math.max(-2, Math.min(2, delta[a]));
        params[a] += step;
        if (Math.abs(step) > maxDelta) maxDelta = Math.abs(step);
      }

      // Enforce threshold ordering
      for (var t = 1; t < nThresh; t++) {
        if (params[t] <= params[t - 1]) params[t] = params[t - 1] + 0.01;
      }

      if (maxDelta < tol) { converged = true; break; }
    }

    var finalLL = logLikelihood(params);

    // Null model log-likelihood (thresholds only, no predictors)
    var nullParams = params.slice(0, nThresh);
    for (var j = 0; j < p; j++) nullParams.push(0);
    var nullLL = logLikelihood(nullParams);

    var pseudoR2 = nullLL === 0 ? 0 : 1 - finalLL / nullLL;
    var aic = -2 * finalLL + 2 * nParams;

    // Standard errors from inverse Hessian (numerical)
    var seParams = new Array(nParams);
    var eps2 = 1e-5;
    var hess2 = [];
    for (var a = 0; a < nParams; a++) hess2.push(new Array(nParams));
    for (var a = 0; a < nParams; a++) {
      for (var b = a; b < nParams; b++) {
        params[b] += eps2;
        params[a] += eps2;
        var f1 = logLikelihood(params);
        params[a] -= 2 * eps2;
        var f2 = logLikelihood(params);
        params[a] += eps2;
        params[b] -= 2 * eps2;
        params[a] += eps2;
        var f3 = logLikelihood(params);
        params[a] -= 2 * eps2;
        var f4 = logLikelihood(params);
        params[a] += eps2;
        params[b] += eps2;
        hess2[a][b] = (f1 - f2 - f3 + f4) / (4 * eps2 * eps2);
        hess2[b][a] = hess2[a][b];
      }
    }
    var negHess2 = hess2.map(function (row) { return row.map(function (v) { return -v; }); });
    var covMatrix = invertMatrix(negHess2);
    if (covMatrix) {
      for (var a = 0; a < nParams; a++) {
        seParams[a] = Math.sqrt(Math.abs(covMatrix[a][a]));
      }
    } else {
      for (var a = 0; a < nParams; a++) seParams[a] = NaN;
    }

    // Build results
    var thresholds = [];
    for (var t = 0; t < nThresh; t++) {
      thresholds.push({
        level: levels[t] + "|" + levels[t + 1],
        alpha: params[t],
        se: seParams[t]
      });
    }

    var coefficients = [];
    for (var j = 0; j < p; j++) {
      var B = params[nThresh + j];
      var se = seParams[nThresh + j];
      var z = se > 0 ? B / se : 0;
      var pv = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
      coefficients.push({
        name: "x" + (j + 1),
        B: B,
        se: se,
        z: z,
        p: pv,
        oddsRatio: Math.exp(B)
      });
    }

    return {
      test: "Ordinal Regression (Proportional Odds)",
      thresholds: thresholds,
      coefficients: coefficients,
      pseudoR2: pseudoR2,
      aic: aic,
      logLikelihood: finalLL,
      N: n,
      levels: levels,
      converged: converged
    };
  }

  /* ================================================================
   *  DECISION TREE (CART)
   * ================================================================ */

  function decisionTree(y, xs, predictorNames) {
    if (xs.length > 0 && typeof xs[0] === "number") {
      xs = [xs];
    }

    var n = y.length;
    var p = xs.length;
    if (!predictorNames) {
      predictorNames = [];
      for (var j = 0; j < p; j++) predictorNames.push("x" + (j + 1));
    }

    // Auto-detect: classification vs regression
    var isClassification = false;
    var uniqueY = {};
    for (var i = 0; i < n; i++) uniqueY[y[i]] = true;
    var uniqueCount = Object.keys(uniqueY).length;
    if (uniqueCount <= 20) {
      // Check if all values are integers or strings
      var allInt = true;
      for (var i = 0; i < n; i++) {
        if (typeof y[i] === "string" || y[i] !== Math.round(y[i])) { allInt = false; break; }
      }
      if (uniqueCount <= 10 || typeof y[0] === "string") isClassification = true;
    }

    var maxDepth = 5;
    var minSamples = 5;

    // Importance accumulator
    var importance = new Array(p);
    for (var j = 0; j < p; j++) importance[j] = 0;

    function gini(indices) {
      var counts = {};
      for (var i = 0; i < indices.length; i++) {
        var v = y[indices[i]];
        counts[v] = (counts[v] || 0) + 1;
      }
      var g = 1;
      var keys = Object.keys(counts);
      for (var k = 0; k < keys.length; k++) {
        var prob = counts[keys[k]] / indices.length;
        g -= prob * prob;
      }
      return g;
    }

    function mse(indices) {
      if (indices.length === 0) return 0;
      var m = 0;
      for (var i = 0; i < indices.length; i++) m += y[indices[i]];
      m /= indices.length;
      var s = 0;
      for (var i = 0; i < indices.length; i++) s += Math.pow(y[indices[i]] - m, 2);
      return s / indices.length;
    }

    function majorityClass(indices) {
      var counts = {};
      for (var i = 0; i < indices.length; i++) {
        var v = y[indices[i]];
        counts[v] = (counts[v] || 0) + 1;
      }
      var best = null, bestCount = -1;
      var keys = Object.keys(counts);
      for (var k = 0; k < keys.length; k++) {
        if (counts[keys[k]] > bestCount) { bestCount = counts[keys[k]]; best = keys[k]; }
      }
      return best;
    }

    function meanValue(indices) {
      var s = 0;
      for (var i = 0; i < indices.length; i++) s += y[indices[i]];
      return s / indices.length;
    }

    function isPure(indices) {
      if (indices.length <= 1) return true;
      var first = y[indices[0]];
      for (var i = 1; i < indices.length; i++) {
        if (y[indices[i]] !== first) return false;
      }
      return true;
    }

    var nLeaves = 0;
    var maxActualDepth = 0;

    function buildNode(indices, depth) {
      if (depth > maxActualDepth) maxActualDepth = depth;

      // Leaf conditions
      if (indices.length <= minSamples || depth >= maxDepth || isPure(indices)) {
        nLeaves++;
        return {
          leaf: true,
          prediction: isClassification ? majorityClass(indices) : meanValue(indices),
          n: indices.length,
          depth: depth
        };
      }

      var bestGain = -Infinity;
      var bestFeature = -1;
      var bestThreshold = null;
      var bestLeft = null;
      var bestRight = null;

      var parentImpurity = isClassification ? gini(indices) : mse(indices);

      for (var j = 0; j < p; j++) {
        // Get unique sorted values for this feature
        var vals = [];
        for (var i = 0; i < indices.length; i++) vals.push(xs[j][indices[i]]);
        var uniqueVals = [];
        var seen = {};
        vals.sort(function (a, b) { return a - b; });
        for (var i = 0; i < vals.length; i++) {
          if (!seen[vals[i]]) { uniqueVals.push(vals[i]); seen[vals[i]] = true; }
        }

        // Try midpoints as thresholds
        for (var t = 0; t < uniqueVals.length - 1; t++) {
          var threshold = (uniqueVals[t] + uniqueVals[t + 1]) / 2;
          var leftIdx = [];
          var rightIdx = [];
          for (var i = 0; i < indices.length; i++) {
            if (xs[j][indices[i]] <= threshold) leftIdx.push(indices[i]);
            else rightIdx.push(indices[i]);
          }
          if (leftIdx.length === 0 || rightIdx.length === 0) continue;

          var leftImpurity = isClassification ? gini(leftIdx) : mse(leftIdx);
          var rightImpurity = isClassification ? gini(rightIdx) : mse(rightIdx);
          var weightedImpurity = (leftIdx.length * leftImpurity + rightIdx.length * rightImpurity) / indices.length;
          var gain = parentImpurity - weightedImpurity;

          if (gain > bestGain) {
            bestGain = gain;
            bestFeature = j;
            bestThreshold = threshold;
            bestLeft = leftIdx;
            bestRight = rightIdx;
          }
        }
      }

      if (bestFeature === -1 || bestGain <= 0) {
        nLeaves++;
        return {
          leaf: true,
          prediction: isClassification ? majorityClass(indices) : meanValue(indices),
          n: indices.length,
          depth: depth
        };
      }

      // Record importance
      importance[bestFeature] += bestGain * indices.length;

      return {
        leaf: false,
        feature: bestFeature,
        featureName: predictorNames[bestFeature],
        threshold: bestThreshold,
        n: indices.length,
        depth: depth,
        left: buildNode(bestLeft, depth + 1),
        right: buildNode(bestRight, depth + 1)
      };
    }

    // Build tree
    var allIdx = [];
    for (var i = 0; i < n; i++) allIdx.push(i);
    var tree = buildNode(allIdx, 0);

    // Normalize importance
    var impSum = 0;
    for (var j = 0; j < p; j++) impSum += importance[j];
    var importanceResult = [];
    for (var j = 0; j < p; j++) {
      importanceResult.push({
        predictor: predictorNames[j],
        importance: impSum > 0 ? importance[j] / impSum : 0
      });
    }
    importanceResult.sort(function (a, b) { return b.importance - a.importance; });

    // Predictions
    function predict(node, idx) {
      if (node.leaf) return node.prediction;
      return xs[node.feature][idx] <= node.threshold ? predict(node.left, idx) : predict(node.right, idx);
    }

    var predictions = [];
    for (var i = 0; i < n; i++) predictions.push(predict(tree, i));

    // Accuracy or R-squared
    var metric = {};
    if (isClassification) {
      var correct = 0;
      for (var i = 0; i < n; i++) {
        if (String(predictions[i]) === String(y[i])) correct++;
      }
      metric.accuracy = correct / n;
    } else {
      var yMean = mean(y);
      var ssRes = 0, ssTot = 0;
      for (var i = 0; i < n; i++) {
        ssRes += Math.pow(y[i] - predictions[i], 2);
        ssTot += Math.pow(y[i] - yMean, 2);
      }
      metric.rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    }

    var result = {
      test: "Decision Tree (CART)",
      tree: tree,
      importance: importanceResult,
      depth: maxActualDepth,
      nLeaves: nLeaves,
      N: n,
      type: isClassification ? "classification" : "regression",
      predictions: predictions
    };
    if (metric.accuracy !== undefined) result.accuracy = metric.accuracy;
    if (metric.rSquared !== undefined) result.rSquared = metric.rSquared;

    return result;
  }

  /* ================================================================
   *  DISCRIMINANT ANALYSIS (LDA)
   * ================================================================ */

  function discriminantAnalysis(groups, xs) {
    if (xs.length > 0 && typeof xs[0] === "number") {
      xs = [xs];
    }

    var n = groups.length;
    var p = xs.length;

    // Get unique group labels
    var labels = [];
    for (var i = 0; i < n; i++) {
      if (labels.indexOf(groups[i]) === -1) labels.push(groups[i]);
    }
    labels.sort();
    var k = labels.length;

    // Build observation matrix (n x p)
    var data = [];
    for (var i = 0; i < n; i++) {
      var row = [];
      for (var j = 0; j < p; j++) row.push(xs[j][i]);
      data.push(row);
    }

    // Grand mean
    var grandMean = new Array(p);
    for (var j = 0; j < p; j++) {
      var s = 0;
      for (var i = 0; i < n; i++) s += data[i][j];
      grandMean[j] = s / n;
    }

    // Group means and indices
    var groupMeans = [];
    var groupIndices = [];
    for (var g = 0; g < k; g++) {
      var indices = [];
      for (var i = 0; i < n; i++) {
        if (groups[i] === labels[g]) indices.push(i);
      }
      groupIndices.push(indices);
      var gm = new Array(p);
      for (var j = 0; j < p; j++) {
        var s = 0;
        for (var ii = 0; ii < indices.length; ii++) s += data[indices[ii]][j];
        gm[j] = s / indices.length;
      }
      groupMeans.push(gm);
    }

    // Within-group scatter matrix Sw (p x p)
    var Sw = [];
    for (var a = 0; a < p; a++) {
      Sw.push(new Array(p));
      for (var b = 0; b < p; b++) Sw[a][b] = 0;
    }
    for (var g = 0; g < k; g++) {
      for (var ii = 0; ii < groupIndices[g].length; ii++) {
        var i = groupIndices[g][ii];
        for (var a = 0; a < p; a++) {
          for (var b = 0; b < p; b++) {
            Sw[a][b] += (data[i][a] - groupMeans[g][a]) * (data[i][b] - groupMeans[g][b]);
          }
        }
      }
    }

    // Between-group scatter matrix Sb (p x p)
    var Sb = [];
    for (var a = 0; a < p; a++) {
      Sb.push(new Array(p));
      for (var b = 0; b < p; b++) Sb[a][b] = 0;
    }
    for (var g = 0; g < k; g++) {
      var ng = groupIndices[g].length;
      for (var a = 0; a < p; a++) {
        for (var b = 0; b < p; b++) {
          Sb[a][b] += ng * (groupMeans[g][a] - grandMean[a]) * (groupMeans[g][b] - grandMean[b]);
        }
      }
    }

    // Sw^-1 * Sb
    var SwInv = invertMatrix(Sw);
    if (!SwInv) {
      return { test: "Discriminant Analysis (LDA)", error: "Singular within-group scatter matrix" };
    }

    // Matrix multiply SwInv * Sb
    var M = [];
    for (var a = 0; a < p; a++) {
      M.push(new Array(p));
      for (var b = 0; b < p; b++) {
        var s = 0;
        for (var c = 0; c < p; c++) s += SwInv[a][c] * Sb[c][b];
        M[a][b] = s;
      }
    }

    // Eigendecompose
    var eigen = jacobiEigen(M);

    // Sort eigenvalues descending
    var eigenPairs = [];
    for (var i = 0; i < eigen.values.length; i++) {
      var vec = [];
      for (var j = 0; j < p; j++) vec.push(eigen.vectors[j][i]);
      eigenPairs.push({ value: eigen.values[i], vector: vec });
    }
    eigenPairs.sort(function (a, b) { return b.value - a.value; });

    var eigenvalues = eigenPairs.map(function (e) { return Math.max(0, e.value); });

    // Project data and classify by nearest centroid
    var nDims = Math.min(k - 1, p);
    var projections = [];
    for (var i = 0; i < n; i++) {
      var proj = new Array(nDims);
      for (var d = 0; d < nDims; d++) {
        var s = 0;
        for (var j = 0; j < p; j++) s += data[i][j] * eigenPairs[d].vector[j];
        proj[d] = s;
      }
      projections.push(proj);
    }

    // Project group centroids
    var projCentroids = [];
    for (var g = 0; g < k; g++) {
      var proj = new Array(nDims);
      for (var d = 0; d < nDims; d++) {
        var s = 0;
        for (var j = 0; j < p; j++) s += groupMeans[g][j] * eigenPairs[d].vector[j];
        proj[d] = s;
      }
      projCentroids.push(proj);
    }

    // Classify by nearest centroid in projected space
    var classifications = [];
    var correct = 0;
    var confusionMatrix = [];
    for (var g = 0; g < k; g++) {
      confusionMatrix.push(new Array(k));
      for (var h = 0; h < k; h++) confusionMatrix[g][h] = 0;
    }

    for (var i = 0; i < n; i++) {
      var minDist = Infinity;
      var bestG = 0;
      for (var g = 0; g < k; g++) {
        var dist = 0;
        for (var d = 0; d < nDims; d++) {
          dist += Math.pow(projections[i][d] - projCentroids[g][d], 2);
        }
        if (dist < minDist) { minDist = dist; bestG = g; }
      }
      classifications.push(labels[bestG]);
      var trueG = labels.indexOf(groups[i]);
      confusionMatrix[trueG][bestG]++;
      if (labels[bestG] === groups[i]) correct++;
    }

    // Wilks' Lambda
    // det(Sw) / det(Sw + Sb)
    var SwPlusSb = [];
    for (var a = 0; a < p; a++) {
      SwPlusSb.push(new Array(p));
      for (var b = 0; b < p; b++) SwPlusSb[a][b] = Sw[a][b] + Sb[a][b];
    }

    // Determinant via LU (use product of eigenvalues as approximation)
    var eigenSw = jacobiEigen(Sw);
    var eigenTotal = jacobiEigen(SwPlusSb);
    var detSw = 1, detTotal = 1;
    for (var i = 0; i < p; i++) {
      detSw *= Math.max(eigenSw.values[i], 1e-15);
      detTotal *= Math.max(eigenTotal.values[i], 1e-15);
    }
    var wilksLambda = detTotal > 0 ? detSw / detTotal : 1;

    // Chi-square approximation for Wilks' Lambda
    var chiSquare = -(n - 1 - (p + k) / 2) * Math.log(Math.max(wilksLambda, 1e-15));
    var dfChi = p * (k - 1);
    var pValue = 1 - jStat.chisquare.cdf(chiSquare, dfChi);

    return {
      test: "Discriminant Analysis (LDA)",
      eigenvalues: eigenvalues,
      classifications: classifications,
      accuracy: correct / n,
      confusionMatrix: confusionMatrix,
      wilksLambda: wilksLambda,
      chiSquare: chiSquare,
      p: pValue,
      df: dfChi,
      N: n,
      k: k,
      labels: labels,
      groupMeans: groupMeans
    };
  }

  /* ================================================================
   *  SURVIVAL ANALYSIS  (Kaplan-Meier + Log-Rank)
   * ================================================================ */

  function survivalAnalysis(time, event, group) {
    var n = time.length;

    function kaplanMeier(timeArr, eventArr) {
      var nObs = timeArr.length;
      // Sort by time
      var indexed = [];
      for (var i = 0; i < nObs; i++) {
        indexed.push({ time: timeArr[i], event: eventArr[i] });
      }
      indexed.sort(function (a, b) { return a.time - b.time; });

      var curve = [];
      var atRisk = nObs;
      var survival = 1.0;
      var totalEvents = 0;
      var totalCensored = 0;
      var i = 0;

      while (i < indexed.length) {
        var t = indexed[i].time;
        var events = 0;
        var censored = 0;
        while (i < indexed.length && indexed[i].time === t) {
          if (indexed[i].event === 1) events++;
          else censored++;
          i++;
        }
        totalEvents += events;
        totalCensored += censored;

        if (events > 0) {
          survival *= (1 - events / atRisk);
          curve.push({
            time: t,
            survival: survival,
            atRisk: atRisk,
            events: events,
            censored: censored
          });
        }
        atRisk -= (events + censored);
      }

      // Median survival: first time survival <= 0.5
      var medianSurvival = null;
      for (var c = 0; c < curve.length; c++) {
        if (curve[c].survival <= 0.5) { medianSurvival = curve[c].time; break; }
      }

      return {
        curve: curve,
        medianSurvival: medianSurvival,
        totalEvents: totalEvents,
        totalCensored: totalCensored
      };
    }

    // Overall KM
    var overall = kaplanMeier(time, event);

    var result = {
      test: "Survival Analysis (Kaplan-Meier)",
      survivalCurve: overall.curve,
      medianSurvival: overall.medianSurvival,
      N: n,
      totalEvents: overall.totalEvents,
      totalCensored: overall.totalCensored
    };

    // If groups provided, compute per-group curves and log-rank test
    if (group) {
      var groupLabels = [];
      for (var i = 0; i < n; i++) {
        if (groupLabels.indexOf(group[i]) === -1) groupLabels.push(group[i]);
      }
      groupLabels.sort();
      var nGroups = groupLabels.length;

      var groupCurves = {};
      var groupTimes = {};
      var groupEvents = {};

      for (var g = 0; g < nGroups; g++) {
        var gt = [], ge = [];
        for (var i = 0; i < n; i++) {
          if (group[i] === groupLabels[g]) {
            gt.push(time[i]);
            ge.push(event[i]);
          }
        }
        groupTimes[groupLabels[g]] = gt;
        groupEvents[groupLabels[g]] = ge;
        var km = kaplanMeier(gt, ge);
        groupCurves[groupLabels[g]] = {
          curve: km.curve,
          medianSurvival: km.medianSurvival,
          n: gt.length,
          events: km.totalEvents,
          censored: km.totalCensored
        };
      }

      // Log-rank test
      // Collect all distinct event times
      var eventTimes = [];
      for (var i = 0; i < n; i++) {
        if (event[i] === 1 && eventTimes.indexOf(time[i]) === -1) {
          eventTimes.push(time[i]);
        }
      }
      eventTimes.sort(function (a, b) { return a - b; });

      // For each group, compute observed and expected events
      var observed = new Array(nGroups);
      var expected = new Array(nGroups);
      for (var g = 0; g < nGroups; g++) { observed[g] = 0; expected[g] = 0; }

      // Sort all observations
      var allSorted = [];
      for (var i = 0; i < n; i++) {
        allSorted.push({ time: time[i], event: event[i], group: group[i] });
      }
      allSorted.sort(function (a, b) { return a.time - b.time; });

      // At-risk counts per group at each event time
      for (var ti = 0; ti < eventTimes.length; ti++) {
        var t = eventTimes[ti];
        var nAtRisk = new Array(nGroups);
        var nEvents = new Array(nGroups);
        for (var g = 0; g < nGroups; g++) { nAtRisk[g] = 0; nEvents[g] = 0; }

        for (var i = 0; i < n; i++) {
          var gi = groupLabels.indexOf(allSorted[i].group !== undefined ? allSorted[i].group : group[i]);
          // Check original arrays
          if (time[i] >= t) {
            nAtRisk[groupLabels.indexOf(group[i])]++;
          }
          if (time[i] === t && event[i] === 1) {
            nEvents[groupLabels.indexOf(group[i])]++;
          }
        }

        var totalAtRisk = 0;
        var totalEventsT = 0;
        for (var g = 0; g < nGroups; g++) {
          totalAtRisk += nAtRisk[g];
          totalEventsT += nEvents[g];
        }

        if (totalAtRisk === 0) continue;

        for (var g = 0; g < nGroups; g++) {
          observed[g] += nEvents[g];
          expected[g] += totalEventsT * (nAtRisk[g] / totalAtRisk);
        }
      }

      // Chi-square statistic
      var chi2 = 0;
      for (var g = 0; g < nGroups; g++) {
        if (expected[g] > 0) {
          chi2 += Math.pow(observed[g] - expected[g], 2) / expected[g];
        }
      }
      var dfLR = nGroups - 1;
      var pLR = 1 - jStat.chisquare.cdf(chi2, dfLR);

      result.logRank = {
        chi2: chi2,
        p: pLR,
        df: dfLR,
        observed: observed,
        expected: expected
      };
      result.groupCurves = groupCurves;
      result.groupLabels = groupLabels;
    }

    return result;
  }

  /* ================================================================
   *  MULTIPLE IMPUTATION (MICE)
   * ================================================================ */

  function multipleImputation(data, nImputations) {
    if (nImputations === undefined) nImputations = 5;
    var nCycles = 10;

    // data: array of arrays (columns). Each column is a variable.
    var p = data.length;
    var n = data[0].length;

    // Identify missing pattern
    var missingPattern = [];
    var missingMask = []; // missingMask[j][i] = true if data[j][i] is NaN
    var totalMissing = 0;

    for (var j = 0; j < p; j++) {
      missingMask.push([]);
      var nMiss = 0;
      for (var i = 0; i < n; i++) {
        var isMiss = data[j][i] === null || data[j][i] === undefined || (typeof data[j][i] === "number" && isNaN(data[j][i]));
        missingMask[j].push(isMiss);
        if (isMiss) nMiss++;
      }
      totalMissing += nMiss;
      missingPattern.push({
        column: j,
        nMissing: nMiss,
        pctMissing: (nMiss / n) * 100
      });
    }

    // Columns with missing data
    var colsWithMissing = [];
    for (var j = 0; j < p; j++) {
      if (missingPattern[j].nMissing > 0) colsWithMissing.push(j);
    }

    // If no missing data, return as-is
    if (colsWithMissing.length === 0) {
      return {
        test: "Multiple Imputation (MICE)",
        pooledData: data.map(function (col) { return col.slice(); }),
        imputedDatasets: [data.map(function (col) { return col.slice(); })],
        missingPattern: missingPattern,
        totalMissing: 0,
        N: n,
        p: p,
        nImputations: nImputations,
        convergence: true
      };
    }

    // Initial imputation: fill with column means
    function initialFill(colData, mask) {
      var vals = [];
      for (var i = 0; i < colData.length; i++) {
        if (!mask[i]) vals.push(colData[i]);
      }
      var m = vals.length > 0 ? mean(vals) : 0;
      var filled = colData.slice();
      for (var i = 0; i < filled.length; i++) {
        if (mask[i]) filled[i] = m;
      }
      return filled;
    }

    var imputedDatasets = [];

    for (var imp = 0; imp < nImputations; imp++) {
      // Start with initial fill
      var current = [];
      for (var j = 0; j < p; j++) {
        current.push(initialFill(data[j], missingMask[j]));
      }

      // MICE cycles
      for (var cycle = 0; cycle < nCycles; cycle++) {
        for (var ci = 0; ci < colsWithMissing.length; ci++) {
          var targetCol = colsWithMissing[ci];

          // Build predictor matrix from all other columns
          // Use only complete cases for this column as training
          var trainY = [];
          var trainXs = [];
          var predictorCols = [];
          for (var j = 0; j < p; j++) {
            if (j !== targetCol) predictorCols.push(j);
          }
          for (var j = 0; j < predictorCols.length; j++) trainXs.push([]);

          for (var i = 0; i < n; i++) {
            if (!missingMask[targetCol][i]) {
              trainY.push(current[targetCol][i]);
              for (var j = 0; j < predictorCols.length; j++) {
                trainXs[j].push(current[predictorCols[j]][i]);
              }
            }
          }

          if (trainY.length < predictorCols.length + 2) continue; // Not enough data

          // Fit linear regression
          var reg = linearRegression(trainY, trainXs);
          if (reg.error) continue;

          // Impute missing values
          for (var i = 0; i < n; i++) {
            if (missingMask[targetCol][i]) {
              var pred = reg.coefficients[0]; // intercept
              for (var j = 0; j < predictorCols.length; j++) {
                pred += reg.coefficients[j + 1] * current[predictorCols[j]][i];
              }
              // Add random noise from residual distribution
              var noise = reg.RMSE * (Math.random() * 2 - 1) * 0.5;
              current[targetCol][i] = pred + noise;
            }
          }
        }
      }

      imputedDatasets.push(current);
    }

    // Pool results: average across imputations
    var pooledData = [];
    for (var j = 0; j < p; j++) {
      var pooled = new Array(n);
      for (var i = 0; i < n; i++) {
        if (!missingMask[j][i]) {
          pooled[i] = data[j][i];
        } else {
          var s = 0;
          for (var imp = 0; imp < nImputations; imp++) {
            s += imputedDatasets[imp][j][i];
          }
          pooled[i] = s / nImputations;
        }
      }
      pooledData.push(pooled);
    }

    return {
      test: "Multiple Imputation (MICE)",
      pooledData: pooledData,
      imputedDatasets: imputedDatasets,
      missingPattern: missingPattern,
      totalMissing: totalMissing,
      N: n,
      p: p,
      nImputations: nImputations,
      convergence: true
    };
  }

  /* ================================================================
   *  BAYESIAN HYPOTHESIS TESTING  (JZS Bayes Factor)
   * ================================================================ */

  function bayesianTest(a, b) {
    var nA = a.length, nB = b.length;
    var N = nA + nB;
    var mA = mean(a), mB = mean(b);
    var vA = variance(a, 1), vB = variance(b, 1);

    // Welch's t-test statistics
    var se = Math.sqrt(vA / nA + vB / nB);
    var t = (mA - mB) / se;

    // Welch-Satterthwaite df
    var num = Math.pow(vA / nA + vB / nB, 2);
    var den = Math.pow(vA / nA, 2) / (nA - 1) + Math.pow(vB / nB, 2) / (nB - 1);
    var df = num / den;

    var p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

    // Effect size (Cohen's d)
    var pooledSD = Math.sqrt(((nA - 1) * vA + (nB - 1) * vB) / (nA + nB - 2));
    var effectSize = pooledSD === 0 ? 0 : (mA - mB) / pooledSD;

    // JZS Bayes Factor using numerical integration (Rouder et al., 2009)
    // BF10 = integral from 0 to inf of f(t|g,df) * p(g) dg / f(t|df)
    // where g is the effect size scaling factor under the Cauchy prior
    // p(g) = Cauchy(0,1) prior on effect size

    var nEff = (nA * nB) / (nA + nB); // effective sample size

    // f(t|df) — marginal under H0: just the t-distribution density
    function tDensity(tVal, nu) {
      return jStat.studentt.pdf(tVal, nu);
    }

    // f(t|g, nu) — t-density under H1 with variance inflated by (1 + nEff * g)
    // The non-centrality is 0 but variance of t is inflated
    // Under JZS: p(t|g,H1) = (1 + n*g)^(-1/2) * t-density evaluated at t/sqrt(1+n*g) with same df
    function integrand(g) {
      if (g <= 0) return 0;
      var scale = 1 + nEff * g;
      var tScaled = t / Math.sqrt(scale);
      // Cauchy prior on sqrt(g): p(g) = 1/(pi * (1+g))  (half-Cauchy on g > 0)
      var prior = 1 / (Math.PI * (1 + g));
      return (1 / Math.sqrt(scale)) * tDensity(tScaled, df) * prior;
    }

    // Simpson's rule numerical integration from 0 to upper bound
    // Use substitution g = tan(u)^2 for (0, inf) mapped to (0, pi/2)
    function simpsonIntegrate(fn, lower, upper, nSteps) {
      if (nSteps % 2 !== 0) nSteps++;
      var h = (upper - lower) / nSteps;
      var s = fn(lower) + fn(upper);
      for (var i = 1; i < nSteps; i += 2) s += 4 * fn(lower + i * h);
      for (var i = 2; i < nSteps; i += 2) s += 2 * fn(lower + i * h);
      return (h / 3) * s;
    }

    // Integrate using substitution: g = tan(u)^2, dg = 2*tan(u)*sec^2(u) du
    function transformedIntegrand(u) {
      if (u <= 0 || u >= Math.PI / 2 - 1e-10) return 0;
      var tanU = Math.tan(u);
      var g = tanU * tanU;
      var dg = 2 * tanU / (Math.cos(u) * Math.cos(u));
      return integrand(g) * dg;
    }

    var numerator = simpsonIntegrate(transformedIntegrand, 1e-10, Math.PI / 2 - 1e-10, 500);
    var denominator = tDensity(t, df);

    var bf10 = denominator > 0 ? numerator / denominator : 1;
    // Ensure BF is positive and finite
    if (!isFinite(bf10) || bf10 < 0) bf10 = 1;

    var bf01 = 1 / bf10;

    // Evidence category
    var evidenceCategory;
    if (bf10 < 1 / 10) evidenceCategory = "strong evidence for H0";
    else if (bf10 < 1 / 3) evidenceCategory = "moderate evidence for H0";
    else if (bf10 < 3) evidenceCategory = "inconclusive";
    else if (bf10 < 10) evidenceCategory = "moderate evidence for H1";
    else evidenceCategory = "strong evidence for H1";

    return {
      test: "Bayesian Hypothesis Test (JZS Bayes Factor)",
      bf10: bf10,
      bf01: bf01,
      t: t,
      p: p,
      df: df,
      effectSize: effectSize,
      evidenceCategory: evidenceCategory,
      N: N,
      nA: nA,
      nB: nB,
      meanA: mA,
      meanB: mB
    };
  }

  /* ================================================================
   *  CONJOINT ANALYSIS  (Ratings-based, OLS on dummy-coded levels)
   * ================================================================ */

  function conjointAnalysis(ratings, attributes) {
    // ratings: array of numeric ratings
    // attributes: array of arrays — each inner array is one attribute's
    //   categorical level strings per profile (same length as ratings)
    var n = ratings.length;
    var nAttributes = attributes.length;

    // Dummy-code each attribute and collect metadata
    var dummyInfo = [];
    var allDummies = []; // each entry is one dummy column (array of 0/1)
    var totalLevels = 0;

    for (var a = 0; a < nAttributes; a++) {
      var dc = dummyCode(attributes[a]);
      dummyInfo.push(dc);
      for (var d = 0; d < dc.dummies.length; d++) {
        allDummies.push(dc.dummies[d]);
      }
      totalLevels += dc.levels.length;
    }

    var nDummies = allDummies.length;

    // Run OLS regression
    var reg = linearRegression(ratings, allDummies);
    if (reg.error) {
      return { test: "Conjoint Analysis", error: reg.error };
    }

    // Build part-worths table
    var partWorths = [];
    var colIdx = 0;
    var ranges = [];

    for (var a = 0; a < nAttributes; a++) {
      var dc = dummyInfo[a];
      var attrPartWorths = [0]; // reference level has 0

      // Reference level
      partWorths.push({
        attribute: "Attr" + (a + 1),
        level: dc.reference,
        partWorth: 0,
        se: NaN,
        t: NaN,
        p: NaN
      });

      // Non-reference levels
      for (var d = 0; d < dc.dummies.length; d++) {
        var ci = colIdx + 1; // +1 because coefficients[0] is intercept
        var pw = reg.coefficients[ci];
        attrPartWorths.push(pw);
        partWorths.push({
          attribute: "Attr" + (a + 1),
          level: dc.levels[d + 1],
          partWorth: pw,
          se: reg.se[ci] || NaN,
          t: reg.tStats[ci] || NaN,
          p: reg.pValues[ci] || NaN
        });
        colIdx++;
      }

      // Range for this attribute
      var minPW = attrPartWorths[0], maxPW = attrPartWorths[0];
      for (var d = 1; d < attrPartWorths.length; d++) {
        if (attrPartWorths[d] < minPW) minPW = attrPartWorths[d];
        if (attrPartWorths[d] > maxPW) maxPW = attrPartWorths[d];
      }
      ranges.push(maxPW - minPW);
    }

    // Attribute importance
    var rangeSum = 0;
    for (var a = 0; a < nAttributes; a++) rangeSum += ranges[a];

    var importance = [];
    for (var a = 0; a < nAttributes; a++) {
      importance.push({
        attribute: "Attr" + (a + 1),
        importance: rangeSum === 0 ? 0 : (ranges[a] / rangeSum) * 100
      });
    }

    // Sort importance descending
    importance.sort(function (a, b) { return b.importance - a.importance; });

    return {
      test: "Conjoint Analysis (Ratings-based OLS)",
      partWorths: partWorths,
      importance: importance,
      rSquared: reg.R2,
      adjustedRSquared: reg.adjR2,
      F: reg.F,
      pModel: reg.fP,
      intercept: reg.coefficients[0],
      N: n,
      nAttributes: nAttributes,
      nLevels: totalLevels
    };
  }

  /* ================================================================
   *  MAXDIFF SCALING  (Best-Worst Scaling, count-based)
   * ================================================================ */

  function maxDiff(items, bestCounts, worstCounts, nShown) {
    if (!items || !items.length || !bestCounts || !bestCounts.length) return { error: 'All inputs must be non-empty', valid: false };
    // items: array of item names
    // bestCounts: array of counts (how many times each item chosen as best)
    // worstCounts: array of counts (how many times each item chosen as worst)
    // nShown: array of counts (how many times each item was shown)
    var nItems = items.length;

    // Compute BW scores
    var bwScores = [];
    var minBW = Infinity, maxBW = -Infinity;
    var totalTasks = 0;

    for (var i = 0; i < nItems; i++) {
      var bw = nShown[i] > 0 ? (bestCounts[i] - worstCounts[i]) / nShown[i] : 0;
      bwScores.push(bw);
      if (bw < minBW) minBW = bw;
      if (bw > maxBW) maxBW = bw;
      totalTasks += bestCounts[i]; // total best choices = total tasks (approximately)
    }

    // Rescale to 0-100
    var bwRange = maxBW - minBW;
    var results = [];

    for (var i = 0; i < nItems; i++) {
      var bwStd = bwRange === 0 ? 50 : ((bwScores[i] - minBW) / bwRange) * 100;
      var sqrtBW = worstCounts[i] > 0 ? Math.sqrt(bestCounts[i] / worstCounts[i]) : (bestCounts[i] > 0 ? Infinity : 0);
      results.push({
        name: items[i],
        bestCount: bestCounts[i],
        worstCount: worstCounts[i],
        nShown: nShown[i],
        bwScore: bwScores[i],
        bwScoreStd: bwStd,
        sqrtBW: sqrtBW,
        rank: 0
      });
    }

    // Sort by BW score descending and assign ranks
    results.sort(function (a, b) { return b.bwScore - a.bwScore; });
    for (var i = 0; i < nItems; i++) results[i].rank = i + 1;

    var bestItem = results[0].name;
    var worstItem = results[results.length - 1].name;
    var spreadRatio = results[results.length - 1].bwScore !== 0
      ? results[0].bwScore / Math.abs(results[results.length - 1].bwScore)
      : Infinity;

    return {
      test: "MaxDiff Scaling (Best-Worst)",
      items: results,
      bestItem: bestItem,
      worstItem: worstItem,
      spreadRatio: spreadRatio,
      N: totalTasks
    };
  }

  /* ================================================================
   *  DISCRETE CHOICE MODELING  (Conditional Logit / McFadden)
   * ================================================================ */

  function discreteChoice(nAlternatives, chosenIndex, attributes) {
    // nAlternatives: number of options per choice set
    // chosenIndex: array of which option was chosen (0-based) per choice set
    // attributes: array of arrays, each of length (nChoiceSets * nAlternatives),
    //   representing attribute values for each alternative in each set
    var nSets = chosenIndex.length;
    var nObs = nSets * nAlternatives;
    var nParams = attributes.length;

    // Validate
    for (var j = 0; j < nParams; j++) {
      if (attributes[j].length !== nObs) {
        return { test: "Discrete Choice (Conditional Logit)", error: "Attribute length mismatch" };
      }
    }

    // Newton-Raphson optimization
    var betas = new Array(nParams);
    for (var j = 0; j < nParams; j++) betas[j] = 0;

    var converged = false;
    var maxIter = 50;
    var tol = 1e-6;
    var logLik = -Infinity;

    for (var iter = 0; iter < maxIter; iter++) {
      // Compute utilities and probabilities
      var probs = new Array(nObs);
      var gradient = new Array(nParams);
      for (var j = 0; j < nParams; j++) gradient[j] = 0;

      // Hessian (nParams x nParams)
      var hessian = [];
      for (var j = 0; j < nParams; j++) {
        hessian.push(new Array(nParams));
        for (var k = 0; k < nParams; k++) hessian[j][k] = 0;
      }

      var newLogLik = 0;

      for (var s = 0; s < nSets; s++) {
        var base = s * nAlternatives;

        // Compute V for each alternative
        var V = new Array(nAlternatives);
        var maxV = -Infinity;
        for (var a = 0; a < nAlternatives; a++) {
          V[a] = 0;
          for (var j = 0; j < nParams; j++) {
            V[a] += betas[j] * attributes[j][base + a];
          }
          if (V[a] > maxV) maxV = V[a];
        }

        // Softmax probabilities (with numerical stability)
        var expSum = 0;
        for (var a = 0; a < nAlternatives; a++) {
          V[a] = Math.exp(V[a] - maxV);
          expSum += V[a];
        }
        for (var a = 0; a < nAlternatives; a++) {
          probs[base + a] = V[a] / expSum;
        }

        // Log-likelihood contribution
        newLogLik += Math.log(probs[base + chosenIndex[s]] + 1e-300);

        // Gradient: sum over j of (I(chosen=a) - P_a) * X_aj
        for (var j = 0; j < nParams; j++) {
          var pjxj = 0; // sum P_a * x_aj
          for (var a = 0; a < nAlternatives; a++) {
            var idx = base + a;
            var indicator = (a === chosenIndex[s]) ? 1 : 0;
            gradient[j] += (indicator - probs[idx]) * attributes[j][idx];
            pjxj += probs[idx] * attributes[j][idx];
          }

          // Hessian contribution
          for (var k = j; k < nParams; k++) {
            var pkxk = 0;
            var pjkxjxk = 0;
            for (var a = 0; a < nAlternatives; a++) {
              var idx = base + a;
              pkxk += probs[idx] * attributes[k][idx];
              pjkxjxk += probs[idx] * attributes[j][idx] * attributes[k][idx];
            }
            hessian[j][k] += -(pjkxjxk - pjxj * pkxk);
            if (k !== j) hessian[k][j] = hessian[j][k];
          }
        }
      }

      // Check convergence
      if (Math.abs(newLogLik - logLik) < tol && iter > 0) {
        converged = true;
        logLik = newLogLik;
        break;
      }
      logLik = newLogLik;

      // Newton step: beta_new = beta - H^-1 * g
      var negHessian = [];
      for (var j = 0; j < nParams; j++) {
        negHessian.push([]);
        for (var k = 0; k < nParams; k++) {
          negHessian[j].push(-hessian[j][k]);
        }
      }

      var step = solveLinearSystem(negHessian, gradient);
      if (!step) { converged = false; break; }

      for (var j = 0; j < nParams; j++) {
        betas[j] += step[j];
      }
    }

    // Null log-likelihood (equal probabilities)
    var nullLogLik = nSets * Math.log(1 / nAlternatives);

    // Pseudo R-squared (McFadden)
    var pseudoR2 = 1 - logLik / nullLogLik;

    // AIC, BIC
    var aic = -2 * logLik + 2 * nParams;
    var bic = -2 * logLik + nParams * Math.log(nSets);

    // Standard errors from inverse Hessian
    var negH = [];
    for (var j = 0; j < nParams; j++) {
      negH.push([]);
      for (var k = 0; k < nParams; k++) negH[j].push(-hessian[j][k]);
    }
    var covMatrix = invertMatrix(negH);

    var coefficients = [];
    for (var j = 0; j < nParams; j++) {
      var se = covMatrix ? Math.sqrt(covMatrix[j][j]) : NaN;
      var z = se > 0 ? betas[j] / se : NaN;
      var pVal = isNaN(z) ? NaN : 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
      coefficients.push({
        name: "Attr" + (j + 1),
        B: betas[j],
        se: se,
        z: z,
        p: pVal
      });
    }

    // Predictions and hit rate
    var predictions = [];
    var hits = 0;
    for (var s = 0; s < nSets; s++) {
      var base = s * nAlternatives;
      var bestAlt = 0, bestUtil = -Infinity;
      for (var a = 0; a < nAlternatives; a++) {
        var util = 0;
        for (var j = 0; j < nParams; j++) {
          util += betas[j] * attributes[j][base + a];
        }
        if (util > bestUtil) { bestUtil = util; bestAlt = a; }
      }
      predictions.push(bestAlt);
      if (bestAlt === chosenIndex[s]) hits++;
    }

    return {
      test: "Discrete Choice (Conditional Logit)",
      coefficients: coefficients,
      logLikelihood: logLik,
      nullLogLikelihood: nullLogLik,
      pseudoR2: pseudoR2,
      aic: aic,
      bic: bic,
      nChoiceSets: nSets,
      nAlternatives: nAlternatives,
      converged: converged,
      predictions: predictions,
      hitRate: hits / nSets
    };
  }

  /* ================================================================
   *  LATENT CLASS ANALYSIS  (EM algorithm for binary indicators)
   * ================================================================ */

  function latentClassAnalysis(data, nClasses) {
    if (nClasses === undefined) nClasses = 2;

    // data: array of arrays (columns of 0/1 binary data)
    var nItems = data.length;
    var N = data[0].length;
    var nStarts = 5;
    var maxIter = 100;
    var tol = 1e-6;

    var bestLogLik = -Infinity;
    var bestResult = null;

    for (var start = 0; start < nStarts; start++) {
      // Initialize class probabilities randomly
      var pi = new Array(nClasses);
      var piSum = 0;
      for (var k = 0; k < nClasses; k++) {
        pi[k] = 0.5 + Math.random() * 0.5;
        piSum += pi[k];
      }
      for (var k = 0; k < nClasses; k++) pi[k] /= piSum;

      // Initialize item probabilities randomly
      var theta = []; // nClasses x nItems
      for (var k = 0; k < nClasses; k++) {
        theta.push([]);
        for (var j = 0; j < nItems; j++) {
          theta[k].push(0.2 + Math.random() * 0.6);
        }
      }

      var prevLogLik = -Infinity;
      var convergedStart = false;
      var posteriors = []; // N x nClasses

      for (var iter = 0; iter < maxIter; iter++) {
        // E-step: compute posterior P(class=k | x_i)
        posteriors = [];
        var logLikIter = 0;

        for (var i = 0; i < N; i++) {
          var post = new Array(nClasses);
          var postSum = 0;

          for (var k = 0; k < nClasses; k++) {
            var logP = Math.log(pi[k] + 1e-300);
            for (var j = 0; j < nItems; j++) {
              var xij = data[j][i];
              var t = theta[k][j];
              // Clamp theta to avoid log(0)
              t = Math.max(1e-10, Math.min(1 - 1e-10, t));
              logP += xij * Math.log(t) + (1 - xij) * Math.log(1 - t);
            }
            post[k] = Math.exp(logP);
            postSum += post[k];
          }

          // Normalize
          for (var k = 0; k < nClasses; k++) {
            post[k] = postSum > 0 ? post[k] / postSum : 1 / nClasses;
          }
          posteriors.push(post);
          logLikIter += Math.log(postSum + 1e-300);
        }

        // Check convergence
        if (Math.abs(logLikIter - prevLogLik) < tol && iter > 0) {
          convergedStart = true;
          prevLogLik = logLikIter;
          break;
        }
        prevLogLik = logLikIter;

        // M-step: update parameters
        var nk = new Array(nClasses);
        for (var k = 0; k < nClasses; k++) {
          nk[k] = 0;
          for (var i = 0; i < N; i++) nk[k] += posteriors[i][k];
          pi[k] = nk[k] / N;
        }

        for (var k = 0; k < nClasses; k++) {
          for (var j = 0; j < nItems; j++) {
            var numSum = 0;
            for (var i = 0; i < N; i++) {
              numSum += posteriors[i][k] * data[j][i];
            }
            theta[k][j] = nk[k] > 0 ? numSum / nk[k] : 0.5;
          }
        }
      }

      if (prevLogLik > bestLogLik) {
        bestLogLik = prevLogLik;

        // Compute assignments and class sizes
        var assignments = new Array(N);
        var classSizes = new Array(nClasses);
        for (var k = 0; k < nClasses; k++) classSizes[k] = 0;

        for (var i = 0; i < N; i++) {
          var bestK = 0;
          for (var k = 1; k < nClasses; k++) {
            if (posteriors[i][k] > posteriors[i][bestK]) bestK = k;
          }
          assignments[i] = bestK;
          classSizes[bestK]++;
        }

        // Entropy: -sum(posterior * log(posterior)) / (N * log(nClasses))
        var entropy = 0;
        for (var i = 0; i < N; i++) {
          for (var k = 0; k < nClasses; k++) {
            if (posteriors[i][k] > 1e-300) {
              entropy -= posteriors[i][k] * Math.log(posteriors[i][k]);
            }
          }
        }
        entropy = (N * Math.log(nClasses)) > 0 ? entropy / (N * Math.log(nClasses)) : 0;

        // Number of free parameters: (nClasses - 1) + nClasses * nItems
        var nFreeParams = (nClasses - 1) + nClasses * nItems;
        var aic = -2 * bestLogLik + 2 * nFreeParams;
        var bic = -2 * bestLogLik + nFreeParams * Math.log(N);

        bestResult = {
          test: "Latent Class Analysis (EM)",
          classProbabilities: pi.slice(),
          itemProbabilities: theta.map(function (row) { return row.slice(); }),
          posteriors: posteriors.map(function (row) { return row.slice(); }),
          assignments: assignments,
          classSizes: classSizes,
          logLikelihood: bestLogLik,
          bic: bic,
          aic: aic,
          entropy: entropy,
          nClasses: nClasses,
          N: N,
          nItems: nItems,
          converged: convergedStart,
          nStarts: nStarts
        };
      }
    }

    return bestResult;
  }

  /* ================================================================
   *  CONFIRMATORY FACTOR ANALYSIS — SIMPLIFIED
   * ================================================================ */

  function cfa(data, model) {
    // data: array of arrays (columns = items)
    // model: array of {factor: string, items: [column indices]}
    var nItems = data.length;
    var N = data[0].length;

    // Compute observed covariance matrix
    var means = [];
    for (var j = 0; j < nItems; j++) means.push(mean(data[j]));

    var S = [];
    for (var i = 0; i < nItems; i++) {
      S.push([]);
      for (var j = 0; j < nItems; j++) {
        var cov = 0;
        for (var k = 0; k < N; k++) cov += (data[i][k] - means[i]) * (data[j][k] - means[j]);
        S[i].push(cov / (N - 1));
      }
    }

    // Item standard deviations
    var sds = [];
    for (var j = 0; j < nItems; j++) sds.push(Math.sqrt(S[j][j]));

    var nFactors = model.length;

    // For each factor, extract sub-covariance and compute loadings via eigendecomposition
    // Lambda: nItems x nFactors loading matrix (init to 0)
    var Lambda = [];
    for (var i = 0; i < nItems; i++) {
      Lambda.push([]);
      for (var f = 0; f < nFactors; f++) Lambda[i].push(0);
    }

    var loadingsDetail = [];

    for (var f = 0; f < nFactors; f++) {
      var items = model[f].items;
      var factorName = model[f].factor;
      var nSub = items.length;

      // Extract sub-covariance matrix
      var subCov = [];
      for (var i = 0; i < nSub; i++) {
        subCov.push([]);
        for (var j = 0; j < nSub; j++) {
          subCov[i].push(S[items[i]][items[j]]);
        }
      }

      // Eigendecomposition of sub-covariance
      var eig = jacobiEigen(subCov);
      // Find largest eigenvalue index
      var maxIdx = 0;
      for (var i = 1; i < nSub; i++) {
        if (eig.values[i] > eig.values[maxIdx]) maxIdx = i;
      }
      var lambda1 = eig.values[maxIdx];
      var vec1 = [];
      for (var i = 0; i < nSub; i++) vec1.push(eig.vectors[i][maxIdx]);

      // Compute loadings: sqrt(eigenvalue) * eigenvector (sign so majority positive)
      var sqrtLam = Math.sqrt(Math.max(0, lambda1));
      var posCount = 0;
      for (var i = 0; i < nSub; i++) if (vec1[i] >= 0) posCount++;
      var sign = posCount >= nSub / 2 ? 1 : -1;

      for (var i = 0; i < nSub; i++) {
        var loading = sign * sqrtLam * vec1[i];
        Lambda[items[i]][f] = loading;
        var stdLoading = sds[items[i]] > 0 ? loading / sds[items[i]] : 0;
        // Standardized loading: loading / sd makes it unstandardized; we want the correlation-like version
        // Actually for CFA, standardized loading = loading / sqrt(variance of item) when loading is in raw metric
        // But our eigenvector approach already works in covariance metric, so stdLoading = loading / sd(item)
        // Communality = stdLoading^2
        var communality = stdLoading * stdLoading;
        loadingsDetail.push({
          factor: factorName,
          item: items[i],
          loading: loading,
          stdLoading: stdLoading,
          communality: Math.min(communality, 1)
        });
      }
    }

    // Factor correlation matrix (between-factor correlations estimated from data)
    var Phi = [];
    for (var f1 = 0; f1 < nFactors; f1++) {
      Phi.push([]);
      for (var f2 = 0; f2 < nFactors; f2++) {
        if (f1 === f2) { Phi[f1].push(1); continue; }
        // Estimate factor correlation from cross-loadings in observed covariance
        // Use average correlation of items across factors
        var items1 = model[f1].items;
        var items2 = model[f2].items;
        var corrSum = 0, corrCount = 0;
        for (var i = 0; i < items1.length; i++) {
          for (var j = 0; j < items2.length; j++) {
            var r = S[items1[i]][items2[j]] / (sds[items1[i]] * sds[items2[j]]);
            if (isFinite(r)) { corrSum += r; corrCount++; }
          }
        }
        var avgCorr = corrCount > 0 ? corrSum / corrCount : 0;
        Phi[f1].push(avgCorr);
      }
    }

    // Uniquenesses: Theta = diag(S) - diag(Lambda * Phi * Lambda')
    var uniquenesses = [];
    // Compute implied covariance: Sigma = Lambda * Phi * Lambda' + Theta
    // First: Lambda * Phi
    var LP = [];
    for (var i = 0; i < nItems; i++) {
      LP.push([]);
      for (var f = 0; f < nFactors; f++) {
        var v = 0;
        for (var f2 = 0; f2 < nFactors; f2++) v += Lambda[i][f2] * Phi[f2][f];
        LP[i].push(v);
      }
    }
    // LP * Lambda'
    var Sigma = [];
    for (var i = 0; i < nItems; i++) {
      Sigma.push([]);
      for (var j = 0; j < nItems; j++) {
        var v = 0;
        for (var f = 0; f < nFactors; f++) v += LP[i][f] * Lambda[j][f];
        Sigma[i].push(v);
      }
    }

    // Uniquenesses and add to diagonal
    for (var i = 0; i < nItems; i++) {
      var u = Math.max(0, S[i][i] - Sigma[i][i]);
      uniquenesses.push(u);
      Sigma[i][i] += u;
    }

    // Fit indices
    var p = nItems;

    // Number of free parameters: loadings + uniquenesses + factor correlations
    var nLoadings = 0;
    for (var f = 0; f < nFactors; f++) nLoadings += model[f].items.length;
    var nFreeParams = nLoadings + nItems + (nFactors * (nFactors - 1)) / 2;

    // Invert Sigma
    var SigmaInv = invertMatrix(Sigma);

    var chi2 = 0;
    var df_model = (p * (p + 1)) / 2 - nFreeParams;
    if (df_model < 1) df_model = 1;

    if (SigmaInv) {
      // trace(S * SigmaInv)
      var SxSI = [];
      for (var i = 0; i < p; i++) {
        SxSI.push([]);
        for (var j = 0; j < p; j++) {
          var v = 0;
          for (var k = 0; k < p; k++) v += S[i][k] * SigmaInv[k][j];
          SxSI[i].push(v);
        }
      }
      var traceSxSI = 0;
      for (var i = 0; i < p; i++) traceSxSI += SxSI[i][i];

      // log(det(Sigma)) via sum of log of diagonal of Cholesky-like approach
      // Simplified: use log(det(Sigma)/det(S)) = log(det(SigmaInv * S)^-1)...
      // Actually: chi2 = (N-1) * (trace(S * Sigma^-1) - ln(det(S * Sigma^-1)) - p)
      // det(S * Sigma^-1) = det(SxSI)
      // Approximate det via LU: use product of diagonal after row reduction
      var detSxSI = 1;
      var luMat = [];
      for (var i = 0; i < p; i++) luMat.push(SxSI[i].slice());
      for (var col = 0; col < p; col++) {
        // Partial pivot
        var maxVal = Math.abs(luMat[col][col]);
        var maxRow = col;
        for (var row = col + 1; row < p; row++) {
          if (Math.abs(luMat[row][col]) > maxVal) { maxVal = Math.abs(luMat[row][col]); maxRow = row; }
        }
        if (maxRow !== col) { var tmp = luMat[col]; luMat[col] = luMat[maxRow]; luMat[maxRow] = tmp; detSxSI *= -1; }
        if (Math.abs(luMat[col][col]) < 1e-15) { detSxSI = 1e-15; break; }
        detSxSI *= luMat[col][col];
        for (var row = col + 1; row < p; row++) {
          var factor = luMat[row][col] / luMat[col][col];
          for (var j = col; j < p; j++) luMat[row][j] -= factor * luMat[col][j];
        }
      }

      var logDetSxSI = Math.log(Math.abs(detSxSI));
      chi2 = Math.max(0, (N - 1) * (traceSxSI - logDetSxSI - p));
    }

    var chi2_p = chi2 > 0 && df_model > 0 ? 1 - jStat.chisquare.cdf(chi2, df_model) : 1;

    // Null model: independence (diagonal of S)
    var SigmaNullInv = [];
    for (var i = 0; i < p; i++) {
      SigmaNullInv.push([]);
      for (var j = 0; j < p; j++) {
        SigmaNullInv[i].push(i === j ? 1 / S[i][i] : 0);
      }
    }
    var traceNull = 0;
    for (var i = 0; i < p; i++) traceNull += S[i][i] * SigmaNullInv[i][i]; // = p
    var logDetNull = 0;
    for (var i = 0; i < p; i++) logDetNull += Math.log(1); // det(S * diagInv(S)) diagonal = 1
    var chi2_null = Math.max(0, (N - 1) * (traceNull - logDetNull - p)); // = 0 for perfect diagonal
    // Actually null model: Sigma_null = diag(S), so S * Sigma_null^-1 has diagonal = 1, off-diagonal = S_ij / S_jj
    // Recalculate properly
    chi2_null = 0;
    var SxNI = [];
    for (var i = 0; i < p; i++) {
      SxNI.push([]);
      for (var j = 0; j < p; j++) SxNI[i].push(S[i][j] / S[j][j]);
    }
    var traceNull2 = 0;
    for (var i = 0; i < p; i++) traceNull2 += SxNI[i][i]; // = p
    // det of SxNI
    var detNull = 1;
    var luNull = [];
    for (var i = 0; i < p; i++) luNull.push(SxNI[i].slice());
    for (var col = 0; col < p; col++) {
      var maxVal = Math.abs(luNull[col][col]);
      var maxRow = col;
      for (var row = col + 1; row < p; row++) {
        if (Math.abs(luNull[row][col]) > maxVal) { maxVal = Math.abs(luNull[row][col]); maxRow = row; }
      }
      if (maxRow !== col) { var tmp = luNull[col]; luNull[col] = luNull[maxRow]; luNull[maxRow] = tmp; detNull *= -1; }
      if (Math.abs(luNull[col][col]) < 1e-15) { detNull = 1e-15; break; }
      detNull *= luNull[col][col];
      for (var row = col + 1; row < p; row++) {
        var factor = luNull[row][col] / luNull[col][col];
        for (var j = col; j < p; j++) luNull[row][j] -= factor * luNull[col][j];
      }
    }
    var logDetNull2 = Math.log(Math.abs(detNull));
    chi2_null = Math.max(0, (N - 1) * (traceNull2 - logDetNull2 - p));
    var df_null = (p * (p - 1)) / 2;

    // CFI
    var cfi = 1;
    if (chi2_null - df_null > 0) {
      cfi = 1 - Math.max(chi2 - df_model, 0) / Math.max(chi2_null - df_null, 0);
    }
    cfi = Math.max(0, Math.min(1, cfi));

    // RMSEA
    var rmsea = Math.sqrt(Math.max((chi2 / df_model - 1) / (N - 1), 0));

    // SRMR
    var srmrSum = 0, srmrCount = 0;
    for (var i = 0; i < p; i++) {
      for (var j = 0; j <= i; j++) {
        var stdResid = (S[i][j] - Sigma[i][j]) / Math.sqrt(S[i][i] * S[j][j]);
        srmrSum += stdResid * stdResid;
        srmrCount++;
      }
    }
    var srmr = Math.sqrt(srmrSum / srmrCount);

    // Fit verdict
    var fitVerdict = "poor";
    if (cfi > 0.95 && rmsea < 0.06 && srmr < 0.08) fitVerdict = "good";
    else if (cfi > 0.90 && rmsea < 0.08 && srmr < 0.10) fitVerdict = "acceptable";

    return {
      test: "Confirmatory Factor Analysis (Simplified)",
      loadings: loadingsDetail,
      factorCorrelations: nFactors > 1 ? Phi : null,
      fitIndices: { chi2: chi2, df: df_model, p: chi2_p, cfi: cfi, rmsea: rmsea, srmr: srmr, fitVerdict: fitVerdict },
      uniquenesses: uniquenesses,
      nFactors: nFactors,
      nItems: nItems,
      N: N,
      fitVerdict: fitVerdict
    };
  }

  /* ================================================================
   *  ITEM RESPONSE THEORY — 1PL RASCH MODEL
   * ================================================================ */

  function irt(data) {
    // data: array of arrays (columns = items, values = 0/1 binary responses)
    var nItems = data.length;
    var N = data[0].length;
    var maxIter = 100;
    var tol = 0.001;

    // Proportion correct for each item
    var pCorrect = [];
    for (var j = 0; j < nItems; j++) {
      var s = 0;
      for (var i = 0; i < N; i++) s += data[j][i];
      pCorrect.push(s / N);
    }

    // Person total scores
    var totalScores = [];
    for (var i = 0; i < N; i++) {
      var s = 0;
      for (var j = 0; j < nItems; j++) s += data[j][i];
      totalScores.push(s);
    }

    // Initialize item difficulties
    var b = [];
    for (var j = 0; j < nItems; j++) {
      var pj = Math.max(0.01, Math.min(0.99, pCorrect[j]));
      b.push(Math.log((1 - pj) / pj));
    }

    // Initialize person abilities
    var theta = [];
    for (var i = 0; i < N; i++) {
      var pi = Math.max(0.5, Math.min(nItems - 0.5, totalScores[i]));
      theta.push(Math.log(pi / (nItems - pi)));
    }

    // Newton-Raphson JMLE
    var converged = false;
    for (var iter = 0; iter < maxIter; iter++) {
      var maxChange = 0;

      // Update person abilities
      for (var i = 0; i < N; i++) {
        // Skip perfect or zero scores (they're not estimable)
        if (totalScores[i] === 0 || totalScores[i] === nItems) continue;
        var sumP = 0, sumPQ = 0;
        for (var j = 0; j < nItems; j++) {
          var pij = 1 / (1 + Math.exp(-(theta[i] - b[j])));
          sumP += pij;
          sumPQ += pij * (1 - pij);
        }
        if (sumPQ > 1e-10) {
          var delta = (totalScores[i] - sumP) / sumPQ;
          theta[i] += delta;
          if (Math.abs(delta) > maxChange) maxChange = Math.abs(delta);
        }
      }

      // Update item difficulties
      for (var j = 0; j < nItems; j++) {
        var sumObs = 0, sumP = 0, sumPQ = 0;
        for (var i = 0; i < N; i++) {
          sumObs += data[j][i];
          var pij = 1 / (1 + Math.exp(-(theta[i] - b[j])));
          sumP += pij;
          sumPQ += pij * (1 - pij);
        }
        if (sumPQ > 1e-10) {
          var delta = (sumP - sumObs) / sumPQ;
          b[j] += delta;
          if (Math.abs(delta) > maxChange) maxChange = Math.abs(delta);
        }
      }

      // Center difficulties (identification constraint)
      var meanB = mean(b);
      for (var j = 0; j < nItems; j++) b[j] -= meanB;
      for (var i = 0; i < N; i++) theta[i] -= meanB;

      if (maxChange < tol && iter > 0) { converged = true; break; }
    }

    // Compute standard errors, infit, outfit
    var itemResults = [];
    var itemFitResults = [];

    for (var j = 0; j < nItems; j++) {
      // SE for item difficulty
      var info = 0;
      var infitNum = 0, infitDen = 0;
      var outfitSum = 0, outfitCount = 0;

      for (var i = 0; i < N; i++) {
        var pij = 1 / (1 + Math.exp(-(theta[i] - b[j])));
        var qij = 1 - pij;
        var wij = pij * qij;
        info += wij;

        // Residual
        var resid = data[j][i] - pij;
        // Standardized residual squared
        var zSq = wij > 1e-10 ? (resid * resid) / wij : 0;

        // Infit: weighted mean square
        infitNum += resid * resid;
        infitDen += wij;

        // Outfit: unweighted mean square of standardized residuals
        outfitSum += zSq;
        outfitCount++;
      }

      var se = info > 0 ? 1 / Math.sqrt(info) : NaN;
      var infit = infitDen > 0 ? infitNum / infitDen : NaN;
      var outfit = outfitCount > 0 ? outfitSum / outfitCount : NaN;
      var fitFlag = (infit < 0.7 || infit > 1.3 || outfit < 0.7 || outfit > 1.3) ? "flagged" : "ok";

      itemResults.push({ item: j, difficulty: b[j], se: se, infit: infit, outfit: outfit });
      itemFitResults.push({ item: j, infit: infit, outfit: outfit, fitFlag: fitFlag });
    }

    // Person results
    var personResults = [];
    for (var i = 0; i < N; i++) {
      var info = 0;
      for (var j = 0; j < nItems; j++) {
        var pij = 1 / (1 + Math.exp(-(theta[i] - b[j])));
        info += pij * (1 - pij);
      }
      var se = info > 0 ? 1 / Math.sqrt(info) : NaN;
      personResults.push({ person: i, ability: theta[i], se: se, totalScore: totalScores[i] });
    }

    // Separation reliability
    var thetaVar = variance(theta, 1);
    var meanSE2 = 0;
    var countSE = 0;
    for (var i = 0; i < N; i++) {
      if (isFinite(personResults[i].se)) {
        meanSE2 += personResults[i].se * personResults[i].se;
        countSE++;
      }
    }
    meanSE2 = countSE > 0 ? meanSE2 / countSE : 0;
    var reliability = thetaVar > 0 ? Math.max(0, (thetaVar - meanSE2) / thetaVar) : 0;

    return {
      test: "Item Response Theory — 1PL Rasch (Simplified)",
      itemDifficulties: itemResults,
      personAbilities: personResults,
      reliability: reliability,
      itemFit: itemFitResults,
      meanDifficulty: mean(b),
      sdDifficulty: sd(b, 1),
      meanAbility: mean(theta),
      sdAbility: sd(theta, 1),
      N: N,
      nItems: nItems,
      converged: converged
    };
  }

  /* ================================================================
   *  MIXED-EFFECTS MODEL — RANDOM INTERCEPT
   * ================================================================ */

  function mixedEffects(y, xs, grouping) {
    // y: array (outcome), xs: array of arrays (fixed effect predictors), grouping: array (group labels)
    if (xs.length > 0 && typeof xs[0] === "number") xs = [xs];
    var N = y.length;
    var nFixed = xs.length;

    // OLS for fixed effects
    var olsResult = linearRegression(y, xs);
    if (olsResult.error) return { test: "Mixed-Effects Model (Random Intercept)", error: olsResult.error };

    var betas = olsResult.coefficients; // includes intercept at [0]
    var residuals = olsResult.residuals;

    // Group observations
    var groupMap = {}; // group label -> { indices, residuals, ys, xs_rows }
    for (var i = 0; i < N; i++) {
      var g = grouping[i];
      if (!groupMap[g]) groupMap[g] = { indices: [], residuals: [], ys: [], xRows: [] };
      groupMap[g].indices.push(i);
      groupMap[g].residuals.push(residuals[i]);
      groupMap[g].ys.push(y[i]);
      var xRow = [1];
      for (var j = 0; j < nFixed; j++) xRow.push(xs[j][i]);
      groupMap[g].xRows.push(xRow);
    }
    var groupLabels = Object.keys(groupMap);
    var nGroups = groupLabels.length;

    // Variance components via method of moments
    // Within-group variance of residuals
    var withinSS = 0, withinDF = 0;
    for (var g = 0; g < nGroups; g++) {
      var gr = groupMap[groupLabels[g]].residuals;
      if (gr.length > 1) {
        var grMean = mean(gr);
        for (var i = 0; i < gr.length; i++) withinSS += (gr[i] - grMean) * (gr[i] - grMean);
        withinDF += gr.length - 1;
      }
    }
    var sigmaE2 = withinDF > 0 ? withinSS / withinDF : variance(residuals, 1);

    // Between-group variance of residual means
    var groupMeansR = [];
    var groupNs = [];
    for (var g = 0; g < nGroups; g++) {
      var gr = groupMap[groupLabels[g]].residuals;
      groupMeansR.push(mean(gr));
      groupNs.push(gr.length);
    }

    // Harmonic mean of group sizes
    var harmSum = 0;
    for (var g = 0; g < nGroups; g++) harmSum += 1 / groupNs[g];
    var nHarmonic = nGroups / harmSum;

    var betweenVar = variance(groupMeansR, 1);
    var sigmaU2 = Math.max(0, betweenVar - sigmaE2 / nHarmonic);

    // ICC
    var icc = (sigmaU2 + sigmaE2) > 0 ? sigmaU2 / (sigmaU2 + sigmaE2) : 0;

    // BLUPs for random effects
    var randomEffects = [];
    var groupStats = [];
    for (var g = 0; g < nGroups; g++) {
      var label = groupLabels[g];
      var gd = groupMap[label];
      var nj = gd.ys.length;
      var yBarG = mean(gd.ys);

      // X_bar_j * beta
      var xBarBeta = 0;
      for (var c = 0; c < betas.length; c++) {
        var xBarC = 0;
        for (var i = 0; i < nj; i++) xBarC += gd.xRows[i][c];
        xBarC /= nj;
        xBarBeta += xBarC * betas[c];
      }

      var shrinkage = sigmaU2 / (sigmaU2 + sigmaE2 / nj);
      var uj = shrinkage * (yBarG - xBarBeta);
      randomEffects.push({ group: label, intercept: uj, n: nj });

      groupStats.push({ group: label, n: nj, mean: yBarG, sd: nj > 1 ? sd(gd.ys, 1) : 0 });
    }

    // R-squared marginal (fixed effects only) and conditional (fixed + random)
    var yMean = mean(y);
    var SST = 0;
    for (var i = 0; i < N; i++) SST += (y[i] - yMean) * (y[i] - yMean);

    var SSE_marginal = 0;
    for (var i = 0; i < N; i++) SSE_marginal += residuals[i] * residuals[i];
    var R2_marginal = SST > 0 ? 1 - SSE_marginal / SST : 0;

    // Conditional: include random intercepts
    var SSE_conditional = 0;
    for (var g = 0; g < nGroups; g++) {
      var label = groupLabels[g];
      var gd = groupMap[label];
      var uj = randomEffects[g].intercept;
      for (var i = 0; i < gd.indices.length; i++) {
        var idx = gd.indices[i];
        var condResid = residuals[idx] - uj;
        SSE_conditional += condResid * condResid;
      }
    }
    var R2_conditional = SST > 0 ? 1 - SSE_conditional / SST : 0;

    // Log-likelihood (approximate, based on normal)
    var totalVar = sigmaU2 + sigmaE2;
    var logLik = -0.5 * N * Math.log(2 * Math.PI) - 0.5 * N * Math.log(totalVar) - SSE_marginal / (2 * totalVar);

    var nParams = betas.length + 2; // fixed effects + sigmaU2 + sigmaE2
    var aic = -2 * logLik + 2 * nParams;
    var bic = -2 * logLik + nParams * Math.log(N);

    // Build fixed effects output with names
    var fixedOut = [];
    var names = ["intercept"];
    for (var j = 0; j < nFixed; j++) names.push("x" + (j + 1));
    for (var j = 0; j < betas.length; j++) {
      fixedOut.push({
        name: names[j],
        B: betas[j],
        se: olsResult.se[j] || NaN,
        t: olsResult.tStats[j] || NaN,
        p: olsResult.pValues[j] || NaN
      });
    }

    return {
      test: "Mixed-Effects Model — Random Intercept (Simplified)",
      fixedEffects: fixedOut,
      randomEffects: randomEffects,
      varianceComponents: { sigmaU2: sigmaU2, sigmaE2: sigmaE2, icc: icc },
      icc: icc,
      rSquaredMarginal: R2_marginal,
      rSquaredConditional: R2_conditional,
      nGroups: nGroups,
      N: N,
      nFixed: nFixed,
      logLikelihood: logLik,
      aic: aic,
      bic: bic,
      groupStats: groupStats
    };
  }

  /* ================================================================
   *  INTERPRETATION FUNCTIONS
   * ================================================================ */

  function effectLabel(d) {
    d = Math.abs(d);
    if (d < 0.2) return "negligible";
    if (d < 0.5) return "small";
    if (d < 0.8) return "medium";
    return "large";
  }

  function corrLabel(r) {
    r = Math.abs(r);
    if (r < 0.1) return "negligible";
    if (r < 0.3) return "weak";
    if (r < 0.5) return "moderate";
    if (r < 0.7) return "strong";
    return "very strong";
  }

  function pLabel(p) {
    if (p < 0.001) return "p < .001";
    if (p < 0.01) return "p < .01";
    if (p < 0.05) return "p < .05";
    return "p = " + p.toFixed(3);
  }

  function sigText(p) {
    return p < 0.05 ? "statistically significant" : "not statistically significant";
  }

  var interpret = {

    ttest: function (r) {
      var sig = r.p < 0.05;
      var eff = effectLabel(r.cohensD);
      var summary = "The difference between the two groups is " + sigText(r.p) +
        " (t(" + r.df.toFixed(1) + ") = " + r.t.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " The effect size (Cohen's d = " + Math.abs(r.cohensD).toFixed(3) + ") is " + eff + ".";
      var details = "Group A: M = " + r.meanA.toFixed(3) + ", SD = " + r.sdA.toFixed(3) + ", n = " + r.nA +
        ". Group B: M = " + r.meanB.toFixed(3) + ", SD = " + r.sdB.toFixed(3) + ", n = " + r.nB +
        ". Mean difference = " + r.meanDiff.toFixed(3) + " [95% CI: " + r.ci95.lower.toFixed(3) + ", " + r.ci95.upper.toFixed(3) + "].";
      return { significant: sig, summary: summary, details: details };
    },

    pairedTTest: function (r) {
      var sig = r.p < 0.05;
      var eff = effectLabel(r.cohensD);
      var summary = "The paired difference is " + sigText(r.p) +
        " (t(" + r.df + ") = " + r.t.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " Effect size (Cohen's d = " + Math.abs(r.cohensD).toFixed(3) + ") is " + eff + ".";
      var details = "Mean difference = " + r.meanDiff.toFixed(3) + " (SD = " + r.sdDiff.toFixed(3) + ")" +
        " [95% CI: " + r.ci95.lower.toFixed(3) + ", " + r.ci95.upper.toFixed(3) + "], n = " + r.n + ".";
      return { significant: sig, summary: summary, details: details };
    },

    anova: function (r) {
      var sig = r.p < 0.05;
      var summary = "The difference across the " + r.k + " groups is " + sigText(r.p) +
        " (F(" + r.dfBetween + ", " + r.dfWithin + ") = " + r.F.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " Eta-squared = " + r.etaSquared.toFixed(3) + " (" + effectLabel(Math.sqrt(r.etaSquared) * 2) + " effect).";
      var posthocSig = r.posthoc.filter(function (ph) { return ph.pBonferroni < 0.05; });
      var details = "Grand mean = " + r.grandMean.toFixed(3) + ". " + posthocSig.length + " of " +
        r.posthoc.length + " pairwise comparisons significant after Bonferroni correction.";
      return { significant: sig, summary: summary, details: details };
    },

    mannWhitney: function (r) {
      var sig = r.p < 0.05;
      var summary = "The Mann-Whitney U test is " + sigText(r.p) +
        " (U = " + r.U.toFixed(1) + ", z = " + r.z.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " Effect size r = " + r.r.toFixed(3) + " (" + effectLabel(r.r * 2) + ").";
      var details = "Rank sum A = " + r.rankSumA.toFixed(1) + ", Rank sum B = " + r.rankSumB.toFixed(1) +
        ". nA = " + r.nA + ", nB = " + r.nB + ".";
      return { significant: sig, summary: summary, details: details };
    },

    wilcoxon: function (r) {
      var sig = r.p < 0.05;
      var summary = "The Wilcoxon Signed-Rank test is " + sigText(r.p) +
        " (W = " + r.W.toFixed(1) + ", z = " + r.z.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " Effect size r = " + r.r.toFixed(3) + ".";
      var details = "W+ = " + r.Wplus.toFixed(1) + ", W- = " + r.Wminus.toFixed(1) +
        ". " + r.nNonZero + " non-zero pairs out of " + r.nPairs + " total.";
      return { significant: sig, summary: summary, details: details };
    },

    kruskalWallis: function (r) {
      var sig = r.p < 0.05;
      var summary = "The Kruskal-Wallis test is " + sigText(r.p) +
        " (H(" + r.df + ") = " + r.H.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " Eta-squared = " + r.etaSquared.toFixed(3) + ".";
      var posthocSig = r.posthoc.filter(function (ph) { return ph.pBonferroni < 0.05; });
      var details = posthocSig.length + " of " + r.posthoc.length +
        " post-hoc pairwise comparisons significant (Dunn's test with Bonferroni correction).";
      return { significant: sig, summary: summary, details: details };
    },

    chiSquare: function (r) {
      var sig = r.p < 0.05;
      var vLabel = r.cramersV < 0.1 ? "negligible" : r.cramersV < 0.3 ? "small" : r.cramersV < 0.5 ? "medium" : "large";
      var summary = "The association is " + sigText(r.p) +
        " (chi2(" + r.df + ") = " + r.chiSquare.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " Cramer's V = " + r.cramersV.toFixed(3) + " (" + vLabel + " association).";
      var details = "N = " + r.N + "." + (r.warning ? " Warning: " + r.warning : "");
      return { significant: sig, summary: summary, details: details };
    },

    fisherExact: function (r) {
      var sig = r.p < 0.05;
      var summary = "Fisher's exact test is " + sigText(r.p) +
        " (" + pLabel(r.p) + "). Odds ratio = " + (isFinite(r.oddsRatio) ? r.oddsRatio.toFixed(3) : "Inf") + ".";
      var details = "2x2 table: [" + r.table[0].join(", ") + "] / [" + r.table[1].join(", ") + "]. N = " + r.N + ".";
      return { significant: sig, summary: summary, details: details };
    },

    mcnemar: function (r) {
      var sig = r.p < 0.05;
      var summary = "McNemar's test is " + sigText(r.p) +
        " (chi2(1) = " + r.chiSquare.toFixed(3) + ", " + pLabel(r.p) + ").";
      var details = "Discordant pairs: b = " + r.b + ", c = " + r.c + ".";
      return { significant: sig, summary: summary, details: details };
    },

    twoProportionZ: function (r) {
      var sig = r.p < 0.05;
      var summary = "The difference between proportions is " + sigText(r.p) +
        " (z = " + r.z.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " p1 = " + r.p1.toFixed(3) + " vs p2 = " + r.p2.toFixed(3) + ".";
      var details = "Difference = " + r.diff.toFixed(3) +
        " [95% CI: " + r.ci95.lower.toFixed(3) + ", " + r.ci95.upper.toFixed(3) + "].";
      return { significant: sig, summary: summary, details: details };
    },

    shapiroWilk: function (r) {
      if (r.warning) return { significant: false, summary: r.warning, details: "" };
      var sig = r.p < 0.05;
      var summary = sig
        ? "The data significantly deviates from normality (W = " + r.W.toFixed(4) + ", " + pLabel(r.p) + "). Consider non-parametric tests."
        : "No significant departure from normality detected (W = " + r.W.toFixed(4) + ", " + pLabel(r.p) + "). Parametric tests are appropriate.";
      var details = "n = " + r.n + ".";
      return { significant: sig, summary: summary, details: details };
    },

    levene: function (r) {
      var sig = r.p < 0.05;
      var summary = sig
        ? "Variances are significantly unequal (F(" + r.dfBetween + ", " + r.dfWithin + ") = " + r.F.toFixed(3) + ", " + pLabel(r.p) + "). Use Welch's t-test or a non-parametric alternative."
        : "No significant difference in variances (F(" + r.dfBetween + ", " + r.dfWithin + ") = " + r.F.toFixed(3) + ", " + pLabel(r.p) + "). Equal-variance assumption holds.";
      return { significant: sig, summary: summary, details: "" };
    },

    pearson: function (r) {
      var sig = r.p < 0.05;
      var dir = r.r > 0 ? "positive" : "negative";
      var strength = corrLabel(r.r);
      var summary = "There is a " + strength + " " + dir + " linear relationship (r = " + r.r.toFixed(3) +
        ", " + pLabel(r.p) + "). " + (sig ? "The correlation is statistically significant." : "The correlation is not statistically significant.");
      var details = "R-squared = " + r.rSquared.toFixed(3) + " (" + (r.rSquared * 100).toFixed(1) +
        "% of variance explained). 95% CI: [" + r.ci95.lower.toFixed(3) + ", " + r.ci95.upper.toFixed(3) + "]. n = " + r.n + ".";
      return { significant: sig, summary: summary, details: details };
    },

    spearman: function (r) {
      var sig = r.p < 0.05;
      var dir = r.r > 0 ? "positive" : "negative";
      var strength = corrLabel(r.r);
      var summary = "There is a " + strength + " " + dir + " monotonic relationship (rho = " + r.r.toFixed(3) +
        ", " + pLabel(r.p) + "). " + (sig ? "Significant." : "Not significant.");
      var details = "n = " + r.n + ".";
      return { significant: sig, summary: summary, details: details };
    },

    linearRegression: function (r) {
      if (r.error) return { significant: false, summary: r.error, details: "" };
      var sig = r.fP < 0.05;
      var summary = "The regression model is " + (sig ? "significant" : "not significant") +
        " (F(" + r.p + ", " + (r.n - r.p - 1) + ") = " + r.F.toFixed(3) + ", " + pLabel(r.fP) + ")." +
        " R-squared = " + r.R2.toFixed(3) + " (Adj. R-squared = " + r.adjR2.toFixed(3) + ").";
      var details = "RMSE = " + r.RMSE.toFixed(3) + ". Durbin-Watson = " + r.durbinWatson.toFixed(3) + ".";
      if (r.coefficients.length <= 5) {
        var coeffStr = r.coefficients.map(function (b, i) {
          return "b" + i + " = " + b.toFixed(4) + " (" + pLabel(r.pValues[i]) + ")";
        }).join("; ");
        details += " Coefficients: " + coeffStr + ".";
      }
      return { significant: sig, summary: summary, details: details };
    },

    logisticRegression: function (r) {
      var summary = "Logistic regression " + (r.converged ? "converged" : "did not converge") +
        " in " + r.iterations + " iterations. McFadden's pseudo-R-squared = " + r.pseudoR2.toFixed(3) + ".";
      var details = "Log-likelihood = " + r.logLikelihood.toFixed(2) +
        ". AIC = " + r.AIC.toFixed(2) + ", BIC = " + r.BIC.toFixed(2) + ".";
      if (r.oddsRatios.length <= 5) {
        var orStr = r.oddsRatios.map(function (or, i) {
          return "OR" + i + " = " + or.toFixed(3) + " (" + pLabel(r.pValues[i]) + ")";
        }).join("; ");
        details += " " + orStr + ".";
      }
      return { significant: r.converged && r.pValues && r.pValues.some(function (p) { return p < 0.05; }), summary: summary, details: details };
    },

    cronbachAlpha: function (r) {
      var level = r.alpha >= 0.9 ? "excellent" : r.alpha >= 0.8 ? "good" : r.alpha >= 0.7 ? "acceptable" : r.alpha >= 0.6 ? "questionable" : r.alpha >= 0.5 ? "poor" : "unacceptable";
      var summary = "Cronbach's alpha = " + r.alpha.toFixed(3) + " (" + level + " reliability) across " + r.k + " items and " + r.n + " respondents.";
      var weakItems = [];
      for (var i = 0; i < r.itemTotalCorrelations.length; i++) {
        if (r.itemTotalCorrelations[i] < 0.3) weakItems.push(i);
      }
      var details = weakItems.length > 0
        ? "Items " + weakItems.join(", ") + " have low corrected item-total correlations (< 0.3). Consider removal."
        : "All items show adequate item-total correlations (>= 0.3).";
      return { significant: r.alpha >= 0.7, summary: summary, details: details };
    },

    pca: function (r) {
      var over70 = 0;
      for (var i = 0; i < r.cumulativeVariance.length; i++) {
        if (r.cumulativeVariance[i] >= 0.7) { over70 = i + 1; break; }
      }
      if (over70 === 0) over70 = r.eigenvalues.length;
      var summary = r.eigenvalues.length + " components extracted. " +
        over70 + " component(s) needed to explain >= 70% of variance." +
        " First component explains " + (r.explainedVariance[0] * 100).toFixed(1) + "%.";
      var details = "Eigenvalues: " + r.eigenvalues.map(function (v) { return v.toFixed(3); }).join(", ") +
        ". Cumulative variance: " + r.cumulativeVariance.map(function (v) { return (v * 100).toFixed(1) + "%"; }).join(", ") + ".";
      return { significant: r.explainedVariance[0] > 0.3, summary: summary, details: details };
    },

    factorAnalysis: function (r) {
      var summary = r.nFactors + " factors extracted with Varimax rotation across " + r.k + " variables.";
      var avgComm = mean(r.communalities);
      var details = "Average communality = " + avgComm.toFixed(3) + ". " +
        "Communalities range from " + Math.min.apply(null, r.communalities).toFixed(3) +
        " to " + Math.max.apply(null, r.communalities).toFixed(3) + ".";
      return { significant: avgComm > 0.4, summary: summary, details: details };
    },

    kMeans: function (r) {
      var summary = "K-Means clustering with k = " + r.k + " " + (r.converged ? "converged" : "did not converge") +
        ". Cluster sizes: [" + r.clusterSizes.join(", ") + "].";
      var ratio = r.totalSS > 0 ? r.betweenSS / r.totalSS : 0;
      var details = "Between-cluster SS / Total SS = " + (ratio * 100).toFixed(1) +
        "% (higher is better). Total within-cluster SS = " + r.totalWithinSS.toFixed(2) + ".";
      return { significant: ratio > 0.5, summary: summary, details: details };
    },

    frequencies: function (r) {
      var summary = r.n + " responses across " + r.uniqueValues.length + " unique values." +
        " Mode: \"" + r.mode + "\" (n = " + r.modeCount + ", " + (r.modeCount / r.n * 100).toFixed(1) + "%).";
      var topVals = r.uniqueValues.slice(0, 5).map(function (v) {
        return "\"" + v + "\": " + r.counts[v] + " (" + r.percentages[v].toFixed(1) + "%)";
      }).join("; ");
      var details = "Top values: " + topVals + ".";
      return { significant: false, summary: summary, details: details };
    },

    phi: function (r) {
      var sig = r.p < 0.05;
      var strength = Math.abs(r.phi) < 0.1 ? "negligible" : Math.abs(r.phi) < 0.3 ? "weak" : Math.abs(r.phi) < 0.5 ? "moderate" : "strong";
      var summary = "The phi coefficient is " + r.phi.toFixed(3) + " (" + strength + " association), " +
        sigText(r.p) + " (" + pLabel(r.p) + ").";
      var details = "Chi-square = " + r.chiSquare.toFixed(3) + ", N = " + r.n + ".";
      return { significant: sig, summary: summary, details: details };
    },

    kendallTau: function (r) {
      var sig = r.p < 0.05;
      var dir = r.tau > 0 ? "positive" : "negative";
      var strength = corrLabel(r.tau);
      var summary = "Kendall's tau-b = " + r.tau.toFixed(3) + " (" + strength + " " + dir + " association), " +
        sigText(r.p) + " (" + pLabel(r.p) + ").";
      var details = "Concordant pairs: " + r.concordant + ", discordant pairs: " + r.discordant +
        ", ties: " + r.ties + ". n = " + r.n + ".";
      return { significant: sig, summary: summary, details: details };
    },

    simpleRegression: function (r) {
      if (r.error) return { significant: false, summary: r.error, details: "" };
      var sig = r.fP < 0.05;
      var summary = "Simple linear regression: " + r.predictionEquation + ". " +
        "The model is " + (sig ? "significant" : "not significant") +
        " (F = " + r.F.toFixed(3) + ", " + pLabel(r.fP) + ")." +
        " R-squared = " + r.rSquared.toFixed(3) + ", r = " + r.correlation.toFixed(3) + ".";
      var details = "Slope = " + r.slope.toFixed(4) + ", Intercept = " + r.intercept.toFixed(4) +
        ". RMSE = " + r.RMSE.toFixed(3) + ". n = " + r.n + ".";
      return { significant: sig, summary: summary, details: details };
    },

    cohensKappa: function (r) {
      var sig = r.p < 0.05;
      var level = r.kappa < 0 ? "poor" : r.kappa < 0.2 ? "slight" : r.kappa < 0.4 ? "fair" : r.kappa < 0.6 ? "moderate" : r.kappa < 0.8 ? "substantial" : "almost perfect";
      var summary = "Cohen's kappa = " + r.kappa.toFixed(3) + " (" + level + " agreement), " +
        sigText(r.p) + " (" + pLabel(r.p) + ").";
      var details = "Observed agreement = " + (r.observedAgreement * 100).toFixed(1) + "%, " +
        "expected agreement = " + (r.expectedAgreement * 100).toFixed(1) + "%. " +
        "95% CI: [" + r.ci95.lower.toFixed(3) + ", " + r.ci95.upper.toFixed(3) + "]. " +
        r.categories.length + " categories, n = " + r.n + ".";
      return { significant: sig, summary: summary, details: details };
    },

    abTest: function (r) {
      var sig = r.p < 0.05;
      var summary;
      if (r.type === "continuous") {
        summary = "A/B test (" + r.type + "): control mean = " + r.controlSummary.mean.toFixed(3) +
          ", variant mean = " + r.variantSummary.mean.toFixed(3) +
          ". Lift = " + r.lift.toFixed(1) + "%. " + (sig ? "Statistically significant" : "Not statistically significant") +
          " (" + pLabel(r.p) + ").";
      } else {
        summary = "A/B test (" + r.type + "): control rate = " + (r.controlSummary.rate * 100).toFixed(1) +
          "%, variant rate = " + (r.variantSummary.rate * 100).toFixed(1) +
          "%. Relative lift = " + r.lift.toFixed(1) + "%. " + (sig ? "Statistically significant" : "Not statistically significant") +
          " (" + pLabel(r.p) + ").";
      }
      var details = "Estimated power = " + (r.power * 100).toFixed(1) + "%. " +
        "Recommended N per group for 80% power: " + (isFinite(r.recommendedN) ? r.recommendedN : "N/A") + ". " +
        "Lift 95% CI: [" + r.liftCI.lower.toFixed(1) + "%, " + r.liftCI.upper.toFixed(1) + "%].";
      return { significant: sig, summary: summary, details: details };
    },

    wordFrequency: function (r) {
      var topThree = r.topWords.slice(0, 3).map(function (w) {
        return "\"" + w.word + "\" (" + w.count + ")";
      }).join(", ");
      var summary = r.totalWords + " total words across " + r.responses + " responses. " +
        r.uniqueWords + " unique words (after stopword removal). " +
        "Avg " + r.avgWordsPerResponse.toFixed(1) + " words per response.";
      var details = "Top words: " + topThree + ". " +
        (r.bigramTop.length > 0 ? "Top bigram: \"" + r.bigramTop[0].bigram + "\" (" + r.bigramTop[0].count + ")." : "No bigrams found.");
      return { significant: false, summary: summary, details: details };
    },

    welchAnova: function (r) {
      var sig = r.p < 0.05;
      var summary = "Welch's ANOVA across " + r.k + " groups is " + sigText(r.p) +
        " (F(" + r.df1 + ", " + r.df2.toFixed(1) + ") = " + r.F.toFixed(3) + ", " + pLabel(r.p) + ").";
      var meansList = r.means.map(function (m, i) {
        return "Group " + (i + 1) + ": M = " + m.toFixed(3) + " (n = " + r.groupStats[i].n + ")";
      }).join("; ");
      var details = meansList + ".";
      return { significant: sig, summary: summary, details: details };
    },

    friedman: function (r) {
      var sig = r.p < 0.05;
      var summary = "The Friedman test across " + r.k + " conditions is " + sigText(r.p) +
        " (chi2(" + r.df + ") = " + r.chi2.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " n = " + r.n + " subjects.";
      var details = "Mean ranks: [" + r.meanRanks.map(function(m) { return m.toFixed(3); }).join(", ") + "]." +
        " Rank sums: [" + r.rankSums.map(function(s) { return s.toFixed(1); }).join(", ") + "].";
      return { significant: sig, summary: summary, details: details };
    },

    repeatedMeasuresAnova: function (r) {
      var sig = r.p < 0.05;
      var summary = "Repeated measures ANOVA across " + r.k + " conditions is " + sigText(r.p) +
        " (F(" + r.df1 + ", " + r.df2 + ") = " + r.F.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " Eta-squared = " + r.etaSquared.toFixed(3) + ".";
      var details = "Greenhouse-Geisser epsilon = " + r.epsilon.toFixed(3) +
        ". Corrected p = " + r.correctedP.toFixed(4) +
        " (df1 = " + r.correctedDf1.toFixed(2) + ", df2 = " + r.correctedDf2.toFixed(2) + ")." +
        " n = " + r.n + " subjects.";
      return { significant: sig, summary: summary, details: details };
    },

    twoWayAnova: function (r) {
      var sigA = r.mainA.p < 0.05;
      var sigB = r.mainB.p < 0.05;
      var sigAB = r.interaction.p < 0.05;
      var summary = "Two-way ANOVA (N = " + r.N + "): " +
        "Factor A is " + sigText(r.mainA.p) + " (F(" + r.mainA.df + ", " + r.error.df + ") = " + r.mainA.F.toFixed(3) + ", " + pLabel(r.mainA.p) + "); " +
        "Factor B is " + sigText(r.mainB.p) + " (F(" + r.mainB.df + ", " + r.error.df + ") = " + r.mainB.F.toFixed(3) + ", " + pLabel(r.mainB.p) + "); " +
        "Interaction is " + sigText(r.interaction.p) + " (F(" + r.interaction.df + ", " + r.error.df + ") = " + r.interaction.F.toFixed(3) + ", " + pLabel(r.interaction.p) + ").";
      var details = "Eta-squared: A = " + r.mainA.etaSquared.toFixed(3) +
        ", B = " + r.mainB.etaSquared.toFixed(3) +
        ", AxB = " + r.interaction.etaSquared.toFixed(3) + "." +
        " Levels A: [" + r.levelsA.join(", ") + "], Levels B: [" + r.levelsB.join(", ") + "].";
      return { significant: sigA || sigB || sigAB, summary: summary, details: details };
    },

    ancova: function (r) {
      var sig = r.p < 0.05;
      var summary = "ANCOVA group effect is " + sigText(r.p) +
        " (F(" + r.df1 + ", " + r.df2 + ") = " + r.F.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " R-squared = " + r.rSquared.toFixed(3) + ".";
      var adjMeansStr = r.adjustedMeans.map(function(am) {
        return am.group + ": " + am.adjustedMean.toFixed(3);
      }).join("; ");
      var details = "Adjusted means: " + adjMeansStr + "." +
        " Covariate effect: B = " + r.covariateEffect.B.toFixed(4) + ", " + pLabel(r.covariateEffect.p) + "." +
        " N = " + r.N + ".";
      return { significant: sig, summary: summary, details: details };
    },

    partialCorrelation: function (r) {
      var sig = r.p < 0.05;
      var dir = r.r > 0 ? "positive" : "negative";
      var strength = corrLabel(r.r);
      var summary = "The partial correlation is " + strength + " " + dir +
        " (r = " + r.r.toFixed(3) + ", " + pLabel(r.p) + "), " + sigText(r.p) + "." +
        " df = " + r.df + ".";
      var details = "t = " + r.t.toFixed(3) + ". 95% CI: [" + r.ci95.lower.toFixed(3) + ", " + r.ci95.upper.toFixed(3) + "]. n = " + r.n + ".";
      return { significant: sig, summary: summary, details: details };
    },

    moderation: function (r) {
      var sig = r.interactionEffect.significant;
      var summary = "Moderation analysis (N = " + r.N + "): the interaction effect is " +
        (sig ? "significant" : "not significant") +
        " (B = " + r.interactionEffect.B.toFixed(4) + ", t = " + r.interactionEffect.t.toFixed(3) +
        ", " + pLabel(r.interactionEffect.p) + ")." +
        " R-squared = " + r.rSquared.toFixed(3) + " (change = " + r.rSquaredChange.toFixed(4) + ").";
      var details = "Simple slopes: at low moderator (-1 SD), slope = " + r.simpleSlopes.lowMod.slope.toFixed(4) +
        " (" + pLabel(r.simpleSlopes.lowMod.p) + "); at high moderator (+1 SD), slope = " + r.simpleSlopes.highMod.slope.toFixed(4) +
        " (" + pLabel(r.simpleSlopes.highMod.p) + ").";
      return { significant: sig, summary: summary, details: details };
    },

    diffInDiff: function (r) {
      var sig = r.didP < 0.05;
      var summary = "Difference-in-Differences estimate = " + r.didEstimate.toFixed(4) +
        " (t = " + r.didT.toFixed(3) + ", " + pLabel(r.didP) + "), " + sigText(r.didP) + "." +
        " Model R-squared = " + r.rSquared.toFixed(3) + ".";
      var details = "Group means: Control Pre = " + r.groupMeans.controlPre.toFixed(3) +
        ", Control Post = " + r.groupMeans.controlPost.toFixed(3) +
        ", Treatment Pre = " + r.groupMeans.treatPre.toFixed(3) +
        ", Treatment Post = " + r.groupMeans.treatPost.toFixed(3) + ". N = " + r.N + ".";
      return { significant: sig, summary: summary, details: details };
    },

    poissonRegression: function (r) {
      var sigCoefs = r.coefficients.filter(function (c) { return c.p < 0.05 && c.name !== "intercept"; });
      var summary = "Poisson regression " + (r.converged ? "converged" : "did not converge") +
        " in " + r.iterations + " iterations. Pseudo R-squared = " + r.pseudoR2.toFixed(3) + ".";
      var details = "Deviance = " + r.deviance.toFixed(2) + " (null = " + r.nullDeviance.toFixed(2) + ")." +
        " AIC = " + r.aic.toFixed(2) + ", BIC = " + r.bic.toFixed(2) + "." +
        " N = " + r.N + ", df = " + r.df + ".";
      if (r.coefficients.length <= 6) {
        var coefStr = r.coefficients.map(function (c) {
          return c.name + ": B = " + c.B.toFixed(4) + ", RR = " + c.expB.toFixed(3) + " (" + pLabel(c.p) + ")";
        }).join("; ");
        details += " Coefficients: " + coefStr + ".";
      }
      return { significant: r.converged && sigCoefs.length > 0, summary: summary, details: details };
    },

    mediation: function (r) {
      var sig = r.sobelP < 0.05;
      var summary = "Mediation analysis (N = " + r.N + "): the indirect effect (a*b = " + r.indirectEffect.toFixed(4) +
        ") is " + sigText(r.sobelP) + " (Sobel z = " + r.sobelZ.toFixed(3) + ", " + pLabel(r.sobelP) + ")." +
        " Proportion mediated = " + (r.proportionMediated * 100).toFixed(1) + "%.";
      var details = "Path a (X->M): B = " + r.pathA.B.toFixed(4) + " (" + pLabel(r.pathA.p) + "); " +
        "Path b (M->Y): B = " + r.pathB.B.toFixed(4) + " (" + pLabel(r.pathB.p) + "); " +
        "Path c (total): B = " + r.pathC.B.toFixed(4) + " (" + pLabel(r.pathC.p) + "); " +
        "Path c' (direct): B = " + r.pathCprime.B.toFixed(4) + " (" + pLabel(r.pathCprime.p) + ").";
      return { significant: sig, summary: summary, details: details };
    },

    hierarchicalClustering: function (r) {
      var summary = "Hierarchical clustering on " + r.n + " observations produced " + r.merges.length + " merges." +
        " Final merge distance = " + r.heights[r.heights.length - 1].toFixed(3) + ".";
      var firstMerge = r.heights[0];
      var lastMerge = r.heights[r.heights.length - 1];
      var details = "Merge distances range from " + firstMerge.toFixed(3) + " to " + lastMerge.toFixed(3) + "." +
        " Use cutTree(k) to extract k clusters.";
      return { significant: false, summary: summary, details: details };
    },

    sentiment: function (r) {
      var overallLabel = r.meanScore > 0.5 ? "positive" : r.meanScore < -0.5 ? "negative" : "neutral";
      var summary = "Sentiment analysis of " + r.totalTexts + " texts: overall " + overallLabel +
        " (mean score = " + r.meanScore.toFixed(3) + ")." +
        " Distribution: " + r.distribution.positive + " positive, " + r.distribution.negative + " negative, " +
        r.distribution.neutral + " neutral.";
      var topPos = r.topPositiveWords.slice(0, 3).map(function (w) { return "\"" + w.word + "\" (" + w.count + ")"; }).join(", ");
      var topNeg = r.topNegativeWords.slice(0, 3).map(function (w) { return "\"" + w.word + "\" (" + w.count + ")"; }).join(", ");
      var details = "Top positive words: " + (topPos || "none") + ". Top negative words: " + (topNeg || "none") + "." +
        " Avg words scored per text: " + r.avgWordsScored.toFixed(1) + ". " + r.scoredTexts + " of " + r.totalTexts + " texts had scorable words.";
      return { significant: Math.abs(r.meanScore) > 0.5, summary: summary, details: details };
    },

    postStratWeighting: function (r) {
      var summary = "Post-stratification weighting applied to " + r.n + " respondents across " +
        r.stratumStats.length + " strata." +
        " Design effect = " + r.designEffect.toFixed(3) + ", effective sample size = " + r.effectiveSampleSize.toFixed(1) + ".";
      var stratStr = r.stratumStats.map(function (s) {
        return s.stratum + ": sample " + (s.samplePct * 100).toFixed(1) + "% -> target " + (s.targetPct * 100).toFixed(1) + "% (w = " + s.weight.toFixed(3) + ")";
      }).join("; ");
      var details = "Strata: " + stratStr + "." +
        " Weight range: [" + r.minWeight.toFixed(3) + ", " + r.maxWeight.toFixed(3) + "], CV = " + r.weightCV.toFixed(3) + ".";
      return { significant: false, summary: summary, details: details };
    },

    propensityScoreMatching: function (r) {
      var summary = "Propensity score matching: " + r.nMatched + " of " + r.nTreated + " treated units matched" +
        " (from " + r.nControl + " available controls)." +
        (r.unmatchedTreated > 0 ? " " + r.unmatchedTreated + " treated units unmatched." : "");
      var balStr = r.balanceBefore.map(function (b, i) {
        return "Cov " + i + ": SMD " + b.smdBefore.toFixed(3) + " -> " + r.balanceAfter[i].smdAfter.toFixed(3);
      }).join("; ");
      var details = "Balance (before -> after): " + balStr + ".";
      if (r.att) {
        details += " ATT = " + r.att.estimate.toFixed(4) + " (SE = " + r.att.se.toFixed(4) +
          ", t = " + r.att.t.toFixed(3) + ", " + pLabel(r.att.p) + ").";
      }
      return { significant: r.att ? r.att.p < 0.05 : false, summary: summary, details: details };
    },

    multinomialLogistic: function (r) {
      var summary = "Multinomial logistic regression (" + r.categories.length + " categories, reference = \"" +
        r.reference + "\"). Accuracy = " + (r.accuracy * 100).toFixed(1) + "%.";
      var modelStr = r.models.map(function (m) {
        return m.category + ": " + (m.converged ? "converged" : "did not converge");
      }).join("; ");
      var details = "N = " + r.N + ", " + r.k + " predictor(s). Models: " + modelStr + ".";
      return { significant: r.accuracy > 1 / r.categories.length, summary: summary, details: details };
    },

    ordinalRegression: function (r) {
      var sigCoefs = r.coefficients.filter(function (c) { return c.p < 0.05; });
      var summary = "Ordinal regression (proportional odds) " + (r.converged ? "converged" : "did not converge") +
        ". Pseudo R-squared = " + r.pseudoR2.toFixed(3) + ". " + r.levels.length + " ordinal levels.";
      var coefStr = r.coefficients.map(function (c) {
        return c.name + ": B = " + c.B.toFixed(4) + ", OR = " + c.oddsRatio.toFixed(3) + " (" + pLabel(c.p) + ")";
      }).join("; ");
      var details = "AIC = " + r.aic.toFixed(2) + ". N = " + r.N + "." +
        (r.coefficients.length <= 6 ? " Coefficients: " + coefStr + "." : "");
      return { significant: r.converged && sigCoefs.length > 0, summary: summary, details: details };
    },

    decisionTree: function (r) {
      var summary = "Decision tree (" + r.type + "): depth = " + r.depth + ", " + r.nLeaves + " leaves." +
        (r.type === "classification"
          ? " Accuracy = " + (r.accuracy * 100).toFixed(1) + "%."
          : " R-squared = " + r.rSquared.toFixed(3) + ".");
      var topImp = r.importance.slice(0, 3).map(function (imp) {
        return imp.predictor + " (" + (imp.importance * 100).toFixed(1) + "%)";
      }).join(", ");
      var details = "N = " + r.N + ". Top predictors: " + topImp + ".";
      return {
        significant: r.type === "classification" ? r.accuracy > 0.5 : r.rSquared > 0.1,
        summary: summary,
        details: details
      };
    },

    discriminantAnalysis: function (r) {
      if (r.error) return { significant: false, summary: r.error, details: "" };
      var sig = r.p < 0.05;
      var summary = "LDA across " + r.k + " groups: Wilks' Lambda = " + r.wilksLambda.toFixed(3) +
        ", " + sigText(r.p) + " (chi2(" + r.df + ") = " + r.chiSquare.toFixed(3) + ", " + pLabel(r.p) + ")." +
        " Classification accuracy = " + (r.accuracy * 100).toFixed(1) + "%.";
      var eigenStr = r.eigenvalues.filter(function (v) { return v > 0.001; }).map(function (v) { return v.toFixed(3); }).join(", ");
      var details = "N = " + r.N + ". Eigenvalues: " + eigenStr + ".";
      return { significant: sig, summary: summary, details: details };
    },

    survivalAnalysis: function (r) {
      var summary = "Kaplan-Meier survival analysis: N = " + r.N + ", " + r.totalEvents + " events, " +
        r.totalCensored + " censored." +
        " Median survival = " + (r.medianSurvival !== null ? r.medianSurvival : "not reached") + ".";
      var details = "";
      if (r.logRank) {
        details = "Log-rank test: chi2(" + r.logRank.df + ") = " + r.logRank.chi2.toFixed(3) +
          ", " + pLabel(r.logRank.p) + " (" + sigText(r.logRank.p) + ").";
        if (r.groupLabels) details += " Groups: " + r.groupLabels.join(", ") + ".";
      }
      return { significant: r.logRank ? r.logRank.p < 0.05 : false, summary: summary, details: details };
    },

    multipleImputation: function (r) {
      var colsMissing = r.missingPattern.filter(function (m) { return m.nMissing > 0; });
      var summary = "MICE imputation: " + r.totalMissing + " missing values across " + colsMissing.length +
        " of " + r.p + " variables." +
        " " + r.nImputations + " imputation(s) pooled. N = " + r.N + ".";
      var missStr = colsMissing.slice(0, 5).map(function (m) {
        return "Col " + m.column + ": " + m.nMissing + " (" + m.pctMissing.toFixed(1) + "%)";
      }).join("; ");
      var details = "Missing pattern: " + missStr + "." +
        " Convergence: " + (r.convergence ? "yes" : "no") + ".";
      return { significant: false, summary: summary, details: details };
    },

    bayesianTest: function (r) {
      var summary = "JZS Bayes Factor: BF10 = " + r.bf10.toFixed(3) + " (" + r.evidenceCategory + ")." +
        " Frequentist: t(" + r.df.toFixed(1) + ") = " + r.t.toFixed(3) + ", " + pLabel(r.p) + ".";
      var details = "BF01 = " + r.bf01.toFixed(3) + ". Effect size (Cohen's d) = " + r.effectSize.toFixed(3) + "." +
        " Group A: M = " + r.meanA.toFixed(3) + " (n = " + r.nA + "), Group B: M = " + r.meanB.toFixed(3) + " (n = " + r.nB + ").";
      return { significant: r.bf10 > 3, summary: summary, details: details };
    },

    conjointAnalysis: function (r) {
      if (r.error) return { significant: false, summary: r.error, details: "" };
      var topAttr = r.importance[0];
      var summary = "Conjoint analysis on " + r.N + " profiles across " + r.nAttributes + " attributes (" + r.nLevels + " total levels)." +
        " Model fit: R-squared = " + r.rSquared.toFixed(3) + " (adj = " + r.adjustedRSquared.toFixed(3) + "), " + pLabel(r.pModel) + ".";
      var impStr = r.importance.map(function (imp) {
        return imp.attribute + ": " + imp.importance.toFixed(1) + "%";
      }).join(", ");
      var details = "Most important attribute: " + topAttr.attribute + " (" + topAttr.importance.toFixed(1) + "%)." +
        " Importance: " + impStr + ". Intercept = " + r.intercept.toFixed(3) + ".";
      return { significant: r.pModel < 0.05, summary: summary, details: details };
    },

    maxDiff: function (r) {
      var summary = "MaxDiff scaling across " + r.items.length + " items." +
        " Best item: " + r.bestItem + " (score 100), Worst item: " + r.worstItem + " (score 0).";
      var top3 = r.items.slice(0, Math.min(3, r.items.length)).map(function (it) {
        return it.name + " (" + it.bwScoreStd.toFixed(1) + ")";
      }).join(", ");
      var details = "Top items: " + top3 + ". Spread ratio = " + (isFinite(r.spreadRatio) ? r.spreadRatio.toFixed(2) : "Inf") +
        ". Total tasks/choices = " + r.N + ".";
      return { significant: true, summary: summary, details: details };
    },

    discreteChoice: function (r) {
      if (r.error) return { significant: false, summary: r.error, details: "" };
      var summary = "Conditional logit on " + r.nChoiceSets + " choice sets (" + r.nAlternatives + " alternatives each)." +
        " McFadden pseudo-R2 = " + r.pseudoR2.toFixed(3) + ". Hit rate = " + (r.hitRate * 100).toFixed(1) + "%.";
      var sigCoefs = r.coefficients.filter(function (c) { return c.p < 0.05; });
      var details = sigCoefs.length + " of " + r.coefficients.length + " attributes significant at p < .05." +
        " Log-likelihood = " + r.logLikelihood.toFixed(2) + ", AIC = " + r.aic.toFixed(1) + ", BIC = " + r.bic.toFixed(1) + "." +
        " Converged: " + (r.converged ? "yes" : "no") + ".";
      return { significant: sigCoefs.length > 0, summary: summary, details: details };
    },

    latentClassAnalysis: function (r) {
      var summary = "Latent class analysis identified " + r.nClasses + " classes from " + r.N + " observations on " + r.nItems + " binary items." +
        " Class sizes: " + r.classSizes.join(", ") + ".";
      var classProbs = r.classProbabilities.map(function (p, k) {
        return "Class " + (k + 1) + ": " + (p * 100).toFixed(1) + "%";
      }).join(", ");
      var details = "Class proportions: " + classProbs + "." +
        " BIC = " + r.bic.toFixed(1) + ", AIC = " + r.aic.toFixed(1) + ", Entropy = " + r.entropy.toFixed(3) + "." +
        " Converged: " + (r.converged ? "yes" : "no") + " (" + r.nStarts + " random starts).";
      return { significant: true, summary: summary, details: details };
    },

    cfa: function (r) {
      if (r.error) return { significant: false, summary: r.error, details: "" };
      var fi = r.fitIndices;
      var summary = "This simplified CFA tested " + r.nFactors + " factor(s) across " + r.nItems + " items (N = " + r.N + ")." +
        " Model fit is " + r.fitVerdict + ": CFI = " + fi.cfi.toFixed(3) + ", RMSEA = " + fi.rmsea.toFixed(3) + ", SRMR = " + fi.srmr.toFixed(3) + ".";
      var topLoadings = r.loadings.slice(0, Math.min(5, r.loadings.length)).map(function (l) {
        return l.factor + "[" + l.item + "] = " + l.stdLoading.toFixed(3);
      }).join(", ");
      var details = "Chi-square(" + fi.df + ") = " + fi.chi2.toFixed(2) + ", " + pLabel(fi.p) + "." +
        " Top standardized loadings: " + topLoadings + "." +
        " Note: This is a simplified CFA using eigendecomposition of sub-covariance matrices rather than full ML estimation.";
      return { significant: fi.p < 0.05, summary: summary, details: details };
    },

    irt: function (r) {
      if (r.error) return { significant: false, summary: r.error, details: "" };
      var flagged = r.itemFit.filter(function (f) { return f.fitFlag === "flagged"; });
      var summary = "This simplified 1PL Rasch model estimated " + r.nItems + " item difficulties and " + r.N + " person abilities." +
        " Separation reliability = " + r.reliability.toFixed(3) + ". Converged: " + (r.converged ? "yes" : "no") + ".";
      var easiest = r.itemDifficulties.slice().sort(function (a, b) { return a.difficulty - b.difficulty; });
      var details = "Mean difficulty = " + r.meanDifficulty.toFixed(3) + " (SD = " + r.sdDifficulty.toFixed(3) + ")." +
        " Mean ability = " + r.meanAbility.toFixed(3) + " (SD = " + r.sdAbility.toFixed(3) + ")." +
        " " + flagged.length + " of " + r.nItems + " items flagged for misfit (infit/outfit outside 0.7–1.3)." +
        " Easiest item: " + easiest[0].item + " (b = " + easiest[0].difficulty.toFixed(3) + ")," +
        " Hardest item: " + easiest[easiest.length - 1].item + " (b = " + easiest[easiest.length - 1].difficulty.toFixed(3) + ")." +
        " Note: This is a simplified IRT using JMLE, not marginal MLE.";
      return { significant: r.reliability > 0.7, summary: summary, details: details };
    },

    mixedEffects: function (r) {
      if (r.error) return { significant: false, summary: r.error, details: "" };
      var vc = r.varianceComponents;
      var summary = "This simplified random-intercept model has " + r.nFixed + " fixed effect(s) and " + r.nGroups + " groups (N = " + r.N + ")." +
        " ICC = " + r.icc.toFixed(3) + " — " + (r.icc > 0.1 ? "substantial" : "low") + " clustering.";
      var sigFixed = r.fixedEffects.filter(function (f) { return f.p < 0.05; });
      var details = sigFixed.length + " of " + r.fixedEffects.length + " fixed effects significant at p < .05." +
        " Variance components: sigma_u^2 = " + vc.sigmaU2.toFixed(4) + ", sigma_e^2 = " + vc.sigmaE2.toFixed(4) + "." +
        " R^2 marginal = " + r.rSquaredMarginal.toFixed(3) + ", R^2 conditional = " + r.rSquaredConditional.toFixed(3) + "." +
        " AIC = " + r.aic.toFixed(1) + ", BIC = " + r.bic.toFixed(1) + "." +
        " Note: This is a simplified mixed model using method-of-moments variance estimation, not full REML.";
      return { significant: sigFixed.length > 0 || r.icc > 0.1, summary: summary, details: details };
    },

    pointBiserial: function(r) {
      var abs = Math.abs(r.r);
      var strength = abs < 0.1 ? 'negligible' : abs < 0.3 ? 'small' : abs < 0.5 ? 'moderate' : 'strong';
      var sig = r.p < 0.05;
      return {
        significant: sig,
        summary: sig ?
          'There is a ' + strength + ' correlation (r = ' + r.r.toFixed(3) + ') between the binary and continuous variables.' :
          'No significant correlation was found (r = ' + r.r.toFixed(3) + ', p = ' + r.p.toFixed(3) + ').',
        details: 'Point-biserial r = ' + r.r.toFixed(4) + ', p = ' + r.p.toFixed(4) + '. Group means: ' + (r.mean0 !== undefined ? r.mean0.toFixed(2) + ' vs ' + r.mean1.toFixed(2) : 'N/A')
      };
    },

    correlationMatrix: function(r) {
      return {
        significant: false,
        summary: 'Correlation matrix computed for ' + (r.matrix ? r.matrix.length : '?') + ' variables.',
        details: 'Examine the matrix for strong correlations (|r| > 0.5) and significant p-values.'
      };
    },

    describe: function(r) {
      return {
        significant: false,
        summary: r.n + ' values analyzed. Mean = ' + r.mean.toFixed(2) + ', Median = ' + r.median.toFixed(2) + ', SD = ' + r.sd.toFixed(2) + '.',
        details: 'Range: ' + r.min + ' to ' + r.max + '. Skewness: ' + r.skewness.toFixed(2) + ', Kurtosis: ' + r.kurtosis.toFixed(2) + '.'
      };
    },

    crossTab: function(r) {
      return {
        significant: false,
        summary: 'Cross-tabulation with ' + (r.rowLabels ? r.rowLabels.length : '?') + ' rows and ' + (r.colLabels ? r.colLabels.length : '?') + ' columns. Total N = ' + r.grandTotal + '.',
        details: 'Examine cell counts and percentages for patterns.'
      };
    }
  };

/* ================================================================
 *  EXPORTS
 * ================================================================ */

export {
  describe, detectType,
  ttest, pairedTTest, anova, welchAnova, repeatedMeasuresAnova, twoWayAnova, ancova,
  mannWhitney, wilcoxon, kruskalWallis, friedman,
  chiSquare, fisherExact, mcnemar, twoProportionZ,
  shapiroWilk, levene,
  pearson, spearman, pointBiserial, correlationMatrix, kendallTau, partialCorrelation,
  linearRegression, logisticRegression, simpleRegression, poissonRegression, ordinalRegression, multinomialLogistic,
  cronbachAlpha, cohensKappa,
  pca, factorAnalysis, kMeans, elbowMethod, hierarchicalClustering, discriminantAnalysis,
  frequencies, crossTab, phi,
  abTest, wordFrequency, sentiment,
  moderation, mediation, diffInDiff, propensityScoreMatching, postStratWeighting,
  bayesianTest,
  conjointAnalysis, maxDiff, discreteChoice, latentClassAnalysis,
  cfa, irt, mixedEffects,
  survivalAnalysis, multipleImputation, decisionTree,
  dummyCode, interpret, STOPWORDS, SENTIMENT_LEXICON,
}

export const _helpers = {
  mean, median, mode, sd, variance, sum, rank, percentile,
  iqr, skewness, kurtosis, confidenceInterval, factorial, choose, euclidean, dummyCode,
}
