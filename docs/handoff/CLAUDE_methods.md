# CLAUDE_methods.md
## Statistical Methods Reference — Permanent Plugin Registry

> **This file lives permanently at `docs/handoff/CLAUDE_methods.md`.**
> It does not get swapped out. It grows over time as methods are added.
> When building a new plugin, find it here first — engine function, capabilities, preconditions.
> When adding to the engine, add a stub here too.

---

## How to read this file

Each entry has:
- **Plugin ID** — what `AnalysisRegistry.register({ id: '...' })` expects
- **Engine function** — the `stats-engine.ts` function it calls via `workerClient.runAnalysis()`
- **Status** — `built` | `engine-only` (function exists, plugin not yet written) | `planned` (neither exists yet)
- **requires** — `DataCapability[]` for `CapabilityMatcher`
- **preconditions** — checks that run before the plugin executes
- **Priority** — `P1` (build first) | `P2` | `P3` (advanced, build later)

---

## SECTION 1 — Descriptive and Distribution

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `frequency` | `describe()`, `frequencies()` | built | `categorical\|ordinal` | none | P1 |
| `crosstab` | `crossTabulate()` | built | `categorical`, `segment` | none | P1 |
| `multi_response` | `multiResponseFreq()` | planned | `multiple_response` | none | P1 |
| `descriptives` | `describe()` | engine-only | `continuous` | none | P1 |

---

## SECTION 2 — Group Comparison

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `kw_significance` | `kruskalWallis()` | built | `continuous\|ordinal`, `segment` | minGroupSize(5) | P1 |
| `posthoc` | `mannWhitney()` | built | `continuous\|ordinal`, `segment` | depends on kw_significance | P1 |
| `ttest_independent` | `ttest()` | engine-only | `continuous`, `binary` | normalityCheck, leveneTest | P1 |
| `ttest_paired` | `pairedTTest()` | engine-only | `continuous`, `repeated` | normalityCheck | P1 |
| `anova_oneway` | `anova()` | engine-only | `continuous`, `segment` | normalityCheck, leveneTest | P1 |
| `anova_twoway` | `anovaTwoWay()` | planned | `continuous`, `segment×2` | normalityCheck | P2 |
| `rm_anova` | `repeatedMeasuresANOVA()` | planned | `continuous`, `repeated` | mauchlysSphericity | P1 |
| `ancova` | `ancova()` | planned | `continuous`, `segment`, `covariate` | homogeneityOfSlopes | P2 |
| `manova` | `manova()` | planned | `continuous×2+`, `segment` | boxMTest | P3 |
| `mcnemar` | `mcnemar()` | planned | `binary`, `repeated` | none | P2 |
| `fisher_exact` | `fisherExact()` | planned | `categorical` | expectedCells(5) | P2 |
| `cochranQ` | `cochranQ()` | planned | `binary`, `repeated×3+` | none | P3 |

---

## SECTION 3 — Correlation and Association

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `correlation` | `pearson()`, `spearman()` | built | `continuous` | none | P1 |
| `point_biserial` | `pointBiserial()` | built | `binary`, `continuous` | none | P1 |
| `partial_correlation` | `partialCorrelation()` | planned | `continuous×3+` | none | P2 |
| `polychoric` | `polychoricCorr()` | planned | `ordinal` | none | P2 |
| `tetrachoric` | `tetrachoricCorr()` | planned | `binary` | none | P3 |

---

## SECTION 4 — Regression and Prediction

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `regression` | `linearRegression()` | built | `continuous`, `n>30` | vifCheck(10), normalityOfResiduals | P1 |
| `driver_analysis` | `linearRegression()` | built | `continuous`, `n>100` | depends on regression | P1 |
| `logistic_regression` | `logisticRegression()` | engine-only | `binary`, `n>50` | none | P1 |
| `ordinal_regression` | `ordinalRegression()` | planned | `ordinal`, `n>30` | parallelLinesTest | P1 |
| `hierarchical_regression` | `linearRegression()` blocks | planned | `continuous`, `n>30` | vifCheck per block | P2 |
| `mediation` | `mediation()` | planned | `continuous`, `n>50` | none | P1 |
| `moderation` | `moderation()` | planned | `continuous`, `n>50` | none | P1 |
| `poisson_regression` | `poissonRegression()` | planned | `count`, `n>30` | none | P3 |

---

## SECTION 5 — Scale and Construct Analysis

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `cronbach` | `cronbachAlpha()` | built | `ordinal`, `n>30` | reverseCodeCheck | P1 |
| `efa` | `factorAnalysis()` | built | `ordinal`, `n>100` | kmo(0.6), bartlett | P1 |
| `pca` | `pca()` | engine-only | `continuous`, `n>50` | none | P2 |
| `omega_reliability` | `mcdonaldsOmega()` | planned | `ordinal`, `n>100` | none | P2 |
| `icc` | `icc()` | planned | `continuous`, `raters>1` | none | P2 |
| `cfa` | TBD — SEM framework | planned | `ordinal`, `n>200` | none | P3 — separate decision |
| `harman_cmb` | `harmanSingleFactor()` | planned | `ordinal` | none | P3 |

---

## SECTION 6 — Segmentation and Classification

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `kmeans` | `kMeans()` | engine-only | `continuous` | none | P2 |
| `hierarchical_clustering` | `hierarchicalCluster()` | planned | `continuous` | none | P2 |
| `cluster_validation` | `silhouetteScore()`, `elbowPlot()` | planned | `continuous` | depends on kmeans | P2 |
| `segment_profile` | `describe()` per segment | built | `continuous\|ordinal`, `segment` | none | P1 |

---

## SECTION 7 — Normality and Assumption Checking

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `shapiro_wilk` | `shapiroWilk()` | planned | `continuous`, `n<2000` | none | P1 |
| `levene_test` | `levene()` | planned | `continuous`, `segment` | none | P1 |
| `outlier_detection` | `cooksD()`, `mahalanobis()` | engine-only | `continuous` | none | P2 |

> Note: `shapiroWilk()` and `levene()` are precondition validators used by other plugins — they need to exist as engine functions before P1 plugins that require them can run.

---

## SECTION 8 — Market Research Specific

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `van_westendorp` | `vanWestendorp()` | planned | `ordinal` (4 price Qs) | none | P1 |
| `gabor_granger` | `gaborGranger()` | planned | `binary` (WTP per price) | none | P2 |
| `turf` | `turf()` | planned | `multiple_response` | none | P2 |
| `jar_penalty` | `penaltyAnalysis()` | planned | `ordinal` (JAR scale) | none | P2 |
| `maxdiff` | `maxDiff()` | planned | `choice` | none | P3 — complex |
| `conjoint` | `conjoint()` | planned | `choice` | none | P3 — separate decision |

---

## SECTION 9 — Power Analysis

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `power_ttest` | `powerTTest()` | planned | none — meta plugin | none | P1 |
| `power_anova` | `powerANOVA()` | planned | none — meta plugin | none | P1 |
| `power_correlation` | `powerCorrelation()` | planned | none — meta plugin | none | P1 |
| `power_chisq` | `powerChiSq()` | planned | none — meta plugin | none | P1 |

> Power analysis plugins take user inputs (effect size, alpha, desired power) rather than column data. They return required N or achieved power. The "run all" HeadlessRunner skips these — they are always interactive.

---

## SECTION 10 — Longitudinal and Repeated

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `wave_comparison` | multiple | planned | `DatasetEdge.relationship === 'wave_comparison'` | alignmentValid | P2 |
| `benchmark_overlay` | multiple | planned | `DatasetEdge.relationship === 'benchmark'` | none | P2 |
| `wilcoxon` | `wilcoxon()` | engine-only | `continuous`, `repeated` | none | P2 |
| `friedman` | `friedman()` | engine-only | `ordinal`, `repeated×3+` | none | P2 |

---

## SECTION 11 — Text and Open-Ended

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `sentiment` | Claude API | planned | `verbatim` | sensitivity === 'anonymous' | P2 |
| `theme_extraction` | Claude API | planned | `verbatim` | sensitivity === 'anonymous' | P2 |
| `coded_openend` | `multiResponseFreq()` | planned | `multi_assigned` | none | P2 |

> Text plugins use the Claude API, not the Stats Engine. They follow the same `AnalysisPlugin` contract but their `run()` function calls `semanticChecks.ts` patterns. Always check `sensitivity === 'anonymous'` before firing.

---

## Adding a new method — checklist

When a new method is requested:

- [ ] Find or create its entry in this file
- [ ] Check if `stats-engine.ts` already has the function (it has 59 — check first)
- [ ] If not: add function to `stats-engine.ts`, add typed interface to `types.ts`, add `weights?` if aggregation, write 3+ tests, verify no regressions
- [ ] Write the plugin in `src/plugins/`
- [ ] Write plugin tests — CI refuses merge without them
- [ ] `AnalysisRegistry.register(plugin)` at module load
- [ ] Update this file: change status from `planned` to `engine-only` or `built`
- [ ] Done — `CapabilityMatcher` discovers it automatically
