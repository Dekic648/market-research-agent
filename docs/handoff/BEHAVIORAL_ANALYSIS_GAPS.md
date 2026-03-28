# Behavioral Analysis Gaps

> **Created:** 2026-03-28
> **Context:** Behavioral metrics (revenue, play counts, engagement) are structurally
> different from survey data. The plugin suite was originally designed for bounded,
> ordinal, single-collection survey data. This document records what was fixed,
> what remains, and the design principle guiding future work.

---

## Design principle

Same plugin slots, different method selected by data shape. No new UI paradigm.
No separate analysis flow. The `behavioralSubtype` detection on `ColumnDefinition`
(already identifies `spend`, `count`, `proportion`, `ordinal_rank`, `metric`)
drives method selection inside existing plugins.

---

## What was fixed this session

### 1. DescriptivesPlugin (new — plugin #19)
- Runs on all behavioral metric columns automatically (via TaskProposer Pass 1)
- Produces: mean, median, SD, skewness, kurtosis, percentiles, zero-rate
- Flags: `isSkewed` (|skewness| > 1.5), `isZeroInflated` (zeroRate > 10%)
- Charts: histogram (20 bins) + box plot
- Plain language: leads with zero-rate warning or skew warning when applicable
- **Why:** Without this, users saw regression and correlation for behavioral data
  but never saw the distribution. They couldn't interpret advanced results without
  first understanding the data shape.

### 2. CorrelationPlugin Spearman auto-switch
- Computes skewness per column before choosing method
- If ANY column has |skewness| > 2: uses `spearman()` pairwise instead of `pearson()`
- Notes method in findings, plain language, and chart title
- **Why:** Pearson r assumes bivariate normality. Zero-inflated revenue correlated
  with a survey rating produces artificially weak r. Spearman (rank-based) captures
  the real rank-order relationship.

### 3. SegmentProfilePlugin median + payer rate
- Detects skewed columns (|skewness| > 1.5) and zero-inflated columns (nonZeroRate < 0.9)
- For skewed/ZI columns: computes median per group alongside mean
- For ZI columns: computes nonZeroRate per group ("conversion rate")
- Charts switch to median when data is skewed
- Plain language leads with conversion rate and median, labels mean as "sensitive to outliers"
- **Why:** Arithmetic mean of [0, 0, 0, 0, 200] = 40. Median = 0, conversion = 20%.
  The mean obscures completely different business situations across segments.

### 4. RegressionPlugin log-transform for spend outcomes
- Checks outcome skewness before regression
- If |skewness| > 2 AND outcome has spend keywords AND min >= 0: applies `log1p(y)`
- Notes transformation in finding flags and plain language
- For non-spend skewed outcomes: adds warning but does not auto-transform
- For non-skewed outcomes: no change to existing behavior
- **Why:** OLS on right-skewed revenue produces biased coefficients and misleading R².
  log1p handles zeros gracefully and satisfies residual normality assumptions.

---

## Known gaps — not yet fixed

### Poisson regression for count outcomes
- **Problem:** `regression` and `driver_analysis` use OLS (`linearRegression()`) for
  all continuous outcomes. Count data (games played, purchase frequency) is discrete,
  non-negative, and often overdispersed. OLS produces negative predicted values and
  incorrect standard errors.
- **Engine status:** `poissonRegression()` exists in stats-engine.ts (IRLS with log link).
  Not yet wired to any plugin.
- **Proposed fix:** When outcome has `behavioralSubtype === 'count'`, RegressionPlugin
  should call `poissonRegression()` instead of `linearRegression()`. Coefficients become
  incidence rate ratios (exp(B)).
- **Priority:** P2 — the log-transform fix partially addresses this for spend data,
  but count data needs its own model.

### Two-part / hurdle model for zero-inflated spend
- **Problem:** Revenue with 70% zeros is not just skewed — it has a structural zero
  component (non-payers) and a continuous component (payer spend). Neither OLS nor
  log-OLS correctly models both parts.
- **Engine status:** `logisticRegression()` exists for Part 1 (payer/non-payer).
  `linearRegression()` exists for Part 2 (spend among payers). No combined hurdle model.
- **Proposed fix:** New `HurdleRegressionPlugin` that runs logistic Part 1 + linear
  Part 2, combines findings as "X increases probability of purchase by Y% AND
  increases spend among buyers by Z%."
- **Priority:** P3 — complex assembly. The log-transform + descriptives zero-rate
  warning gets 80% of the insight for now.

### Box plot chart type
- **Current state:** The `boxPlot` ChartType exists in the type enum. DescriptivesPlugin
  generates box plot data using Plotly's native `box` trace type. This works with the
  existing `ChartContainer` (Plotly.newPlot).
- **Gap:** No dedicated box plot comparison chart (e.g., revenue box plots per segment
  side by side). SegmentProfilePlugin could benefit from this.
- **Priority:** P2 — would make segment comparisons much more informative for
  behavioral data.

### Log-transform as user-initiated recode option
- **Current state:** Log-transform is auto-applied only by RegressionPlugin for spend
  outcomes. Users cannot manually request log-transform on any column.
- **Gap:** `logTransform` exists in the `TransformType` enum and `resolveColumn()`
  handles it. But no UI to add it. The RecodePanel could expose this.
- **Priority:** P2 — would let users choose to log-transform before any analysis,
  not just regression.

### Percentile-based segmentation
- **Problem:** Current subgroup filters use threshold operators (>=, <=, etc.).
  For behavioral data, analysts commonly segment by percentile (e.g., "top 10% spenders"
  or "bottom quartile of engagement").
- **Gap:** No percentile-based filter option in SubgroupBar.
- **Priority:** P2 — would make behavioral segmentation much more natural.

### Weighted engine functions
- **Status:** Weight column plumbing is complete (extractWeights, WeightCalculator,
  weight passthrough to plugins via ResolvedColumnData.weights). But the actual
  engine functions (linearRegression, kruskalWallis, correlationMatrix, etc.) do not
  yet accept or use weights. TODO comments are in place.
- **Priority:** P1 for survey data, less critical for behavioral data where weights
  are uncommon.

---

## Plugin safety matrix for behavioral data (post-fixes)

| Plugin | Safe for behavioral? | Notes |
|--------|---------------------|-------|
| `descriptives` | Yes | Built for this purpose |
| `frequency` | No — gated | Blocked in WITHIN_QUESTION_RULES.behavioral.never |
| `crosstab` | No — gated | Blocked in never list |
| `kw_significance` | Yes | Rank-based (KW), robust to skew |
| `posthoc` | Yes | Rank-based (Mann-Whitney) |
| `correlation` | Yes (fixed) | Auto-switches to Spearman for skewed data |
| `regression` | Partially fixed | log1p for spend outcomes; count outcomes still use OLS |
| `driver_analysis` | Partially fixed | Same OLS issue as regression for non-spend outcomes |
| `segment_profile` | Yes (fixed) | Reports median + nonZeroRate for skewed/ZI data |
| `cronbach` | No — gated | Blocked in never list |
| `efa` | No — gated | Blocked in never list |
| `mediation` | Risky | Bootstrap helps but ZI outcome biases path estimates |
| `moderation` | Risky | Interaction term on non-linear data is uninterpretable |
| `point_biserial` | Risky | Assumes normal continuous variable |
| `trend_over_time` | Caution | Period means misleading for skewed data; needs median option |
| `time_segment_comparison` | Yes | KW is rank-based |
| `power_analysis` | Yes | Calculator only |
| `ordinal_regression` | No — gated | Requires ordinal capability, behavioral doesn't emit it |
