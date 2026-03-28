# CLAUDE_methods.md
## Statistical Methods Reference — Permanent Plugin Registry

> **This file lives permanently at `docs/handoff/CLAUDE_methods.md`.**
> It does not get swapped out. It grows over time as methods are added.
> When building a new plugin, find it here first — engine function, capabilities, preconditions.
> When adding to the engine, add a stub here too.
>
> **Last updated:** 2026-03-28 — 22 plugins built, 771 tests passing
>
> **Standard Analysis Plan**: Five-tier waterfall (`buildAnalysisPlan()`) auto-proposes all analyses. Cross-type (survey × behavioral) proposals tagged with `crossType: true` on tasks and findings.

---

## How to read this file

Each entry has:
- **Plugin ID** — what `AnalysisRegistry.register({ id: '...' })` expects
- **Engine function** — the `stats-engine.ts` function it calls
- **Status** — `built` | `engine-only` (function exists, plugin not yet written) | `planned` (neither exists yet)
- **Task wiring** — `auto` (TaskProposer proposes it), `cross-question` (proposed for cross-question analysis), `cross-type-bridge` (survey × behavioral), `manual-only` (user must add it), `—` (not yet wired)
- **requires** — `DataCapability[]` for `CapabilityMatcher`
- **preconditions** — checks that run before the plugin executes
- **Priority** — `P1` (build first) | `P2` | `P3` (advanced, build later)

---

## SECTION 1 — Descriptive and Distribution

| Plugin ID | Engine function | Status | Task wiring | requires | preconditions | Priority |
|---|---|---|---|---|---|---|
| `frequency` | `describe()`, `frequencies()` | built | auto | `categorical\|ordinal` | none | P1 |
| `crosstab` | `crossTabulate()` | built | auto (with segment) | `categorical`, `segment` | none | P1 |
| `multi_response` | `multiResponseFreq()` | planned | — | `multiple_response` | none | P1 |
| `descriptives` | `describe()` | built | auto (behavioral + high-nUnique continuous) | `continuous` | none | P1 |
| `descriptives_summary` | `describe()` + frequency | built | auto (2+ ordinal columns) | `ordinal` | none | P1 |

---

## SECTION 2 — Group Comparison

| Plugin ID | Engine function | Status | Task wiring | requires | preconditions | Priority |
|---|---|---|---|---|---|---|
| `anova_oneway` | `anova()` / `welchAnova()` + `tukeyHSD()` | built | auto (continuous + segment, n>=30/group) | `continuous`, `segment` | shapiroWilk, leveneTest | P1 |
| `kw_significance` | `kruskalWallis()` | built | auto (with segment) | `continuous\|ordinal`, `segment` | minGroupSize(5) | P1 |
| `posthoc` | `mannWhitney()` | built | auto (depends on kw) | `continuous\|ordinal`, `segment` | depends on kw_significance | P1 |
| `time_segment_comparison` | `kruskalWallis()` via groupByPeriod | built | cross-question (temporal × continuous) | `temporal`, `continuous` | 2–8 periods, ≥5 per period | P1 |
| `ttest_independent` | `ttest()` | engine-only | — | `continuous`, `binary` | normalityCheck, leveneTest | P1 |
| `ttest_paired` | `pairedTTest()` | engine-only | — | `continuous`, `repeated` | normalityCheck | P1 |
| `anova_oneway` | `anova()` | engine-only | — | `continuous`, `segment` | normalityCheck, leveneTest | P1 |
| `anova_twoway` | `anovaTwoWay()` | planned | — | `continuous`, `segment×2` | normalityCheck | P2 |
| `rm_anova` | `repeatedMeasuresANOVA()` | engine-only | — | `continuous`, `repeated` | mauchlysSphericity | P1 |
| `ancova` | `ancova()` | engine-only | — | `continuous`, `segment`, `covariate` | homogeneityOfSlopes | P2 |
| `manova` | `manova()` | planned | — | `continuous×2+`, `segment` | boxMTest | P3 |
| `mcnemar` | `mcnemar()` | engine-only | — | `binary`, `repeated` | none | P2 |
| `fisher_exact` | `fisherExact()` | engine-only | — | `categorical` | expectedCells(5) | P2 |
| `cochranQ` | `cochranQ()` | planned | — | `binary`, `repeated×3+` | none | P3 |

---

## SECTION 3 — Correlation and Association

| Plugin ID | Engine function | Status | Task wiring | requires | preconditions | Priority |
|---|---|---|---|---|---|---|
| `correlation` | `pearson()`, `correlationMatrix()` | built | auto (3+ items), cross-question, cross-type-bridge | `continuous` | none | P1 |
| `point_biserial` | `pointBiserial()` | built | cross-question (binary + continuous) | `binary`, `continuous` | none | P1 |
| `partial_correlation` | `partialCorrelation()` | engine-only | — | `continuous×3+` | none | P2 |
| `polychoric` | `polychoricCorr()` | planned | — | `ordinal` | none | P2 |
| `tetrachoric` | `tetrachoricCorr()` | planned | — | `binary` | none | P3 |

---

## SECTION 4 — Regression and Prediction

| Plugin ID | Engine function | Status | Task wiring | requires | preconditions | Priority |
|---|---|---|---|---|---|---|
| `regression` | `linearRegression()` + `kFoldCVLinear()` | built | cross-question, cross-type-bridge | `continuous`, `n>30` | vifCheck(10) | P1 |
| `driver_analysis` | `linearRegression()` + `kFoldCVLinear()` | built | cross-question, cross-type-bridge | `continuous`, `n>30` | depends on regression | P1 |
| `ordinal_regression` | `ordinalRegression()` | built | manual | `ordinal`, `n>30` | parallelLinesTest | P1 |
| `mediation` | `mediation()` + `bootstrapIndirectEffect()` | built | cross-question (3 continuous) | `continuous`, `n>50` | none | P1 |
| `moderation_analysis` | `moderation()` + `johnsonNeyman()` | built | manual | `continuous`, `n>50` | none | P1 |
| `logistic_regression` | `logisticRegression()` + `kFoldCVLogistic()` + `computeAUC()` | built | cross-question (binary outcome) | `binary`, `n>50` | classBalance check | P1 |
| `hierarchical_regression` | `linearRegression()` blocks | planned | — | `continuous`, `n>30` | vifCheck per block | P2 |
| `poisson_regression` | `poissonRegression()` | engine-only | — | `count`, `n>30` | none | P3 |

---

## SECTION 5 — Scale and Construct Analysis

| Plugin ID | Engine function | Status | Task wiring | requires | preconditions | Priority |
|---|---|---|---|---|---|---|
| `cronbach` | `cronbachAlpha()` | built | auto (3+ items) | `ordinal`, `n>30` | reverseCodeCheck | P1 |
| `efa` | `factorAnalysis()` | built | auto (5+ items) | `ordinal`, `n>100` | kmo(0.6), bartlett | P1 |
| `pca` | `pca()` | engine-only | — | `continuous`, `n>50` | none | P2 |
| `omega_reliability` | `mcdonaldsOmega()` | planned | — | `ordinal`, `n>100` | none | P2 |
| `icc` | `icc()` | planned | — | `continuous`, `raters>1` | none | P2 |
| `cfa` | TBD — SEM framework | planned | — | `ordinal`, `n>200` | none | P3 — separate decision |
| `harman_cmb` | `harmanSingleFactor()` | planned | — | `ordinal` | none | P3 |

---

## SECTION 6 — Segmentation and Classification

| Plugin ID | Engine function | Status | Task wiring | requires | preconditions | Priority |
|---|---|---|---|---|---|---|
| `segment_profile` | `describe()` per segment | built | auto (with segment) | `continuous\|ordinal`, `segment` | none | P1 |
| `kmeans` | `kMeans()` | engine-only | — | `continuous` | none | P2 |
| `hierarchical_clustering` | `hierarchicalCluster()` | engine-only | — | `continuous` | none | P2 |
| `cluster_validation` | `silhouetteScore()`, `elbowPlot()` | planned | — | `continuous` | depends on kmeans | P2 |

---

## SECTION 7 — Normality and Assumption Checking

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `shapiro_wilk` | `shapiroWilk()` | engine-only | `continuous`, `n<2000` | none | P1 |
| `levene_test` | `levene()` | engine-only | `continuous`, `segment` | none | P1 |
| `outlier_detection` | `cooksDistance()` | built (inline in regression) | `continuous` | none | P1 |
| `parallel_lines_test` | `parallelLinesTest()` | built (precondition of ordinal_regression) | `ordinal` | none | P1 |

---

## SECTION 8 — Market Research Specific

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `van_westendorp` | `vanWestendorp()` | planned | `ordinal` (4 price Qs) | none | P1 |
| `gabor_granger` | `gaborGranger()` | planned | `binary` (WTP per price) | none | P2 |
| `turf` | `turf()` | planned | `multiple_response` | none | P2 |
| `jar_penalty` | `penaltyAnalysis()` | planned | `ordinal` (JAR scale) | none | P2 |
| `maxdiff` | `maxDiff()` | engine-only | `choice` | none | P3 — complex |
| `conjoint` | `conjoint()` | engine-only | `choice` | none | P3 — separate decision |

---

## SECTION 9 — Power Analysis

| Plugin ID | Engine function | Status | Task wiring | requires | preconditions | Priority |
|---|---|---|---|---|---|---|
| `power_analysis` | `powerTTest()`, `powerANOVA()`, `powerCorrelation()`, `powerChiSq()` | built | manual-only | none — meta plugin | none | P1 |

> All four test types handled by one plugin with a `testType` parameter. Two modes: required N (given effect + power) and achieved power (given N). HeadlessRunner skips this — always interactive. Added to `never` list in TaskProposer for all question types.

---

## SECTION 10 — Temporal Analysis

| Plugin ID | Engine function | Status | Task wiring | requires | preconditions | Priority |
|---|---|---|---|---|---|---|
| `trend_over_time` | `trendOverTime()` | built | cross-question (temporal × continuous) | `temporal`, `continuous` | none | P1 |
| `period_frequency` | `groupByPeriod()` | built | auto (timestamped) | `temporal` | none | P1 |
| `time_segment_comparison` | `groupByPeriod()` + `kruskalWallis()` | built | cross-question (temporal × continuous) | `temporal`, `continuous` | 2–8 periods, ≥5 each | P1 |
| `wave_comparison` | multiple | planned | — | `DatasetEdge.relationship === 'wave_comparison'` | alignmentValid | P2 |
| `benchmark_overlay` | multiple | planned | — | `DatasetEdge.relationship === 'benchmark'` | none | P2 |

---

## SECTION 11 — Model Diagnostics

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `kfold_cv_linear` | `kFoldCVLinear()` | built (inline in regression/driver) | `continuous`, `n>30` | none | P1 |
| `kfold_cv_logistic` | `kFoldCVLogistic()` | built (engine function, not yet plugin) | `binary`, `n>30` | none | P1 |
| `cooks_distance` | `cooksDistance()` | built (inline in regression/driver) | `continuous` | none | P1 |
| `post_analysis_verifier` | `PostAnalysisVerifier.run()` | built (runs after all findings) | any significant finding | segment columns exist | P1 |

---

## SECTION 12 — Text and Open-Ended

| Plugin ID | Engine function | Status | requires | preconditions | Priority |
|---|---|---|---|---|---|
| `sentiment` | Claude API | planned | `verbatim` | sensitivity === 'anonymous' | P2 |
| `theme_extraction` | Claude API | planned | `verbatim` | sensitivity === 'anonymous' | P2 |
| `coded_openend` | `multiResponseFreq()` | planned | `multi_assigned` | none | P2 |

---

## Adding a new method — checklist

When a new method is requested:

- [ ] Find or create its entry in this file
- [ ] Check if `stats-engine.ts` already has the function (it has 60+ — check first)
- [ ] If not: add function to `stats-engine.ts`, add `weights?` if aggregation, write 3+ tests, verify no regressions
- [ ] Write the plugin in `src/plugins/`
- [ ] Write plugin tests
- [ ] `AnalysisRegistry.register(plugin)` at module load
- [ ] **Add to TaskProposer**: add entry in `WITHIN_QUESTION_RULES` matrix (which question types trigger this plugin). For cross-question plugins, add proposal logic in Pass 2.
- [ ] Update this file: change status from `planned` to `built`, set Task wiring column
- [ ] Done — `CapabilityMatcher` discovers it automatically, `TaskProposer` proposes it intelligently
