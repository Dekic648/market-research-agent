# CLAUDE.md — v12
## Market Research Agent — Current State

> **Last updated:** 2026-03-28
> **Test count:** 788 passing across 61 test files
> **Plugins:** 22 built and registered
> **Deploy:** Vercel at market-research-agent-iota.vercel.app

---

## Two product modes (v11)

| Mode | Entry point | Flow |
|---|---|---|
| **Auto (Standard Plan)** | Paste data → Plan card → Run → Results → Report | `buildAnalysisPlan()` generates five-tier waterfall. No manual config needed. |
| **Explorer (manual)** | Always-visible "Use Explorer →" link | `ExplorerPanel` — pick columns, run any analysis, pin to report. |

### Five-tier analysis plan (`src/engine/analysisPlan.ts`)

| Tier | Label | Eligible when | Key plugins |
|---|---|---|---|
| 1 | Distributions | Always | frequency, descriptives, descriptives_summary |
| 2 | Group Comparisons | Segment/dimension column present | kw_significance, anova_oneway, crosstab, segment_profile |
| 3 | Relationships | 2+ analyzable columns | correlation (Pearson/Spearman auto), cronbach, efa |
| 4 | Prediction | Outcome auto-detected | driver_analysis, regression, logistic_regression |
| 5 | Advanced | Always (requires confirmation) | mediation, moderation, power_analysis |

- `buildAnalysisPlan(blocks)` → `AnalysisPlan` (pure function, no store imports)
- `proposeTasksFromPlan(plan)` → `AnalysisTask[]` (Tier 5 tasks excluded unless confirmed)
- `AnalysisPlanCard` component shows plan before execution
- **Cross-type badge**: `Survey × Behavioral` teal pill on findings from mixed-data analyses
- `crossType?: boolean` on both `AnalysisTask` and `Finding`

---

## Three-axis type model (v10)

Column classification uses three independent axes:

| Axis | Type | Purpose | Field on ColumnDefinition |
|---|---|---|---|
| **Format** | `QuestionFormat` | How data was collected (survey design) | `format` |
| **Statistical** | `StatisticalType` | What the engine sees (drives CapabilityMatcher) | `statisticalType` |
| **Role** | `ColumnRole` | What the column is used for in analysis | `role` |

**QuestionFormat** values: `rating`, `matrix`, `checkbox`, `radio`, `category`, `behavioral`, `verbatim`, `timestamped`, `multi_assigned`, `multi_response`, `weight`

**StatisticalType** values: `ordinal`, `continuous`, `categorical`, `binary`, `multi_response`, `text`, `temporal`, `count`, `spend`, `proportion`, `prefixed_ordinal`, `constant`, `geo`

**ColumnRole** values: `analyze`, `segment`, `metric`, `dimension`, `weight`, `unused`

`QuestionType` is a deprecated alias for `QuestionFormat`. Old fields (`type`, `subtype`, `behavioralSubtype`, `categorySubtype`, `behavioralRole`, `questionType`) are kept as optional deprecated on interfaces — will be removed in a future session.

---

## What is built and working

### Analysis plugins (18 registered)

| Plugin ID | Title | Status | Task wiring | Priority |
|---|---|---|---|---|
| `descriptives` | Descriptive Statistics | built | auto (behavioral + high-nUnique) | P1 |
| `frequency` | Frequency Distribution | built | auto | P1 |
| `crosstab` | Cross-tabulation | built | auto (with segment) | P1 |
| `kw_significance` | Significance Testing (KW) | built | auto (with segment) | P1 |
| `posthoc` | Post-hoc Pairwise | built | auto (depends on KW) | P1 |
| `cronbach` | Cronbach's Alpha | built | auto (3+ items) | P1 |
| `efa` | Factor Analysis (EFA) | built | auto (5+ items) | P1 |
| `regression` | Linear Regression | built | cross-question | P1 |
| `driver_analysis` | Key Driver Analysis | built | cross-question | P1 |
| `correlation` | Correlation Matrix | built | cross-question | P1 |
| `point_biserial` | Point-Biserial | built | cross-question | P1 |
| `segment_profile` | Segment Profiles | built | auto (with segment) | P1 |
| `trend_over_time` | Trend over time | built | cross-question (temporal × continuous) | P1 |
| `period_frequency` | Response volume over time | built | auto (timestamped) | P1 |
| `time_segment_comparison` | Compare across time periods | built | cross-question (temporal × continuous) | P1 |
| `ordinal_regression` | Ordinal Regression | built | manual | P1 |
| `mediation` | Mediation Analysis | built | cross-question (3 continuous) | P1 |
| `moderation_analysis` | Moderation Analysis | built | manual | P1 |
| `power_analysis` | Power Calculator | built | manual-only (never auto) | P1 |
| `descriptives_summary` | Summary Statistics Table | built | auto (2+ ordinal columns) | P1 |
| `logistic_regression` | Logistic Regression | built | cross-question (binary outcome) | P1 |
| `anova_oneway` | One-way ANOVA | built | auto (continuous + segment) | P1 |

### Engine layer

| File | Purpose |
|---|---|
| `stats-engine.ts` | ~7100 lines, 60+ statistical functions including linearRegression, logisticRegression, ordinalRegression, mediation, moderation, kFoldCVLinear, kFoldCVLogistic, parallelLinesTest, bootstrapIndirectEffect, johnsonNeyman, powerTTest/ANOVA/Correlation/ChiSq, cooksDistance, multipleImputation |
| `resolveColumn.ts` | Transform pipeline (9 transform types + auto-median imputation for ≤5% missing) |
| `CapabilityMatcher.ts` | Column types → DataCapability set resolution |
| `TaskProposer.ts` | 3-pass proposal engine — within-question + cross-question + cross-type bridge + dependency wiring. `allAnalyzable` = question blocks + behavioral block metrics. Dimension columns from behavioral blocks serve as splits. |
| `PostAnalysisVerifier.ts` | Simpson's Paradox + moderation detection after findings |
| `effectSizeLabels.ts` | Cohen's d, r, R², Cramér's V, ε² magnitude labels |
| `temporalAnalysis.ts` | trendOverTime, groupByPeriod, detectGranularity |
| `timeUtils.ts` | parseTimestamp (ISO, Unix, Excel), toPeriod, sortPeriods, rollingAverage |
| `rowFilter.ts` | Row-level filtering for Explorer panel |
| `subgroupFilter.ts` | Subgroup row filtering + formatOperator |
| `weightExtractor.ts` | Weight validation and extraction from DatasetNode |
| `rakeWeights.ts` | computeRakeWeights for population-proportion weighting |
| `suggestedQuestions.ts` | Business-language analysis prompts from dataset structure |
| `routingDetector.ts` | Detects when null patterns are caused by routing conditions |

### Stores (Zustand, 5 primary + 2 utility)

| Store | Purpose |
|---|---|
| `datasetGraph` | DatasetNode/Edge CRUD + transforms + imputation + weights + subgroups |
| `sessionStore` | Active session state |
| `findingsStore` | Findings CRUD + FDR + verification + getOrderedForReport |
| `chartStore` | Chart config management |
| `analysisLog` | Audit trail for all actions |
| `selectionStore` | Explorer panel column selection |
| `persistence` | IndexedDB persistence |

### Components

| Area | Components |
|---|---|
| Data Input | DataWorkspace, QuestionBlockEntry (+ Add Behavioral Data), QuestionBlockCard (per-column role toggles), BulkTaggerTable (role column), PasteGrid, TaskReview, ColumnTagger |
| Data Preparation | PrepWorkspace, MissingDataPanel, RecodePanel, WeightCalculator, DataSummaryCard |
| Analysis Display | AnalysisResults (method-grouped), ResultsPageHeader, FlagsStrip, MethodSection, ResultQuestionBlock, StepCard (interactive mode), FindingCard, PlainLanguageCard, MetricsRow, DataTable |
| Results Grouping | `src/results/methodGroups.ts` (METHOD_GROUPS constant), `src/results/groupFindings.ts` (pure grouping function) |
| Charts | ChartContainer (direct Plotly.newPlot) |
| Report | ReportBuilder (Auto Report + Custom tabs), TLDRReport, FindingsList, ChartSelector, SectionEditor, ExportPanel |
| Explorer | ExplorerPanel (3-zone sandbox), RowFilterBar |
| Subgroup | SubgroupBar |
| Shared | ErrorBoundary |

### Detection & Preparation

- 11 statistical detection checks (reverse code, merged headers, timestamp, skewed, zero-inflated, prefixed ordinal, constant, near-zero variance, collapsed categories, straight-liners, duplicate rows)
- Routing correlation detector (Jaccard overlap for null pattern matching)
- Little's MCAR test
- MICE imputation (wired to UI, uses engine's multipleImputation)
- Auto-median imputation for ≤5% missing behavioral columns
- Null semantics (nullMeaning: 'not_chosen' | 'not_asked' | 'missing')

### Runners

- HeadlessRunner — batch execution, auto FDR (BH), PostAnalysisVerifier, weight passthrough
- InteractiveRunner — step-by-step, PostAnalysisVerifier, weight passthrough

---

## Seven non-negotiable rules (unchanged from v1)

1. rawValues are immutable after parse — NEVER written to after adapter
2. Stats engine is pure — no store imports, no React, no side effects
3. No plugin names in CapabilityMatcher — capability matching only
4. Exactly 5 Zustand stores (datasetGraph, session, chart, findings, analysisLog)
5. 3 mandatory fields on every AnalysisLogEntry: userId, dataFingerprint, dataVersion
6. FindingsStore.add() is the only way to create findings
7. All stores are JSON-serializable (no functions, no DOM nodes, no circular refs)

---

## Current priority — four tracks

1. **DatasetGraph multi-node** — wave comparison, benchmarks, multi-brand (not started)
2. **Supabase** — auth, session sync, collaboration (not started)
3. **Advanced statistical methods** — ongoing (see CLAUDE_methods.md)
4. **Parser adapters** — Qualtrics, SPSS, SurveyMonkey (needs sample data)

---

## Track 1 — DatasetGraph multi-node flows (not started)

Unchanged from v5. Single-dataset analysis is fully functional. Multi-node flows involve two or more nodes connected by edges — wave comparison, benchmark overlay, multi-sample comparison. Build when the first multi-dataset use case arises.

---

## Track 2 — Supabase integration (not started)

Unchanged from v5. Schema (sessions + column_data tables), sync strategy (IndexedDB as cache, Supabase as truth), collaboration groundwork (userId already on all log entries).

---

## Track 3 — Advanced statistical methods (active)

Consult `docs/handoff/CLAUDE_methods.md` for the full plugin registry. Notable progress:

- **MR-2 complete:** ordinalRegression (with parallelLinesTest), mediation (with bootstrap CI), moderation (with JN regions)
- **MR-3 complete:** powerTTest, powerANOVA, powerCorrelation, powerChiSq — all four as one PowerAnalysisPlugin
- **Temporal complete:** TrendPlugin, PeriodGroupPlugin, TimeSegmentPlugin
- **Cross-validation complete:** kFoldCVLinear, kFoldCVLogistic wired into RegressionPlugin and DriverPlugin
- **AIC/BIC:** added to linearRegression (was only on logistic)

Remaining P1: repeatedMeasuresANOVA, vanWestendorp. Engine functions exist for both but plugins are not built.

---

## Track 4 — Parser adapters (blocked on sample data)

Unchanged. Each adapter requires sample data files before building.

---

## What was built in the extended session

### Null semantics system
- `nullMeaning: 'not_chosen' | 'not_asked' | 'missing'` on ColumnDefinition
- Routing detection prompt (>30% null rate → conditional question prompt)
- FrequencyPlugin/CrosstabPlugin denominator branching by nullMeaning
- MissingDataPanel exclusion of not_chosen/not_asked columns

### Routing correlation detector
- `detectRoutingSource()` — Jaccard overlap ≥0.85 to auto-detect routing conditions
- Follow-up card in QuestionBlockCard offering auto-subgroup creation
- `source: 'auto' | 'manual'` on SubgroupFilter

### Subgroup filter system
- `SubgroupFilter` on DatasetNode with 7 operators
- `SubgroupBar` component with define/clear flow
- `subgroupContext` on Finding with badge rendering
- `computeSubgroupIndices()` for row filtering

### Weight plumbing
- `extractWeights()` validation utility
- `computeRakeWeights()` with normalization to mean=1
- `WeightCalculator` component with population proportion input
- `setComputedWeights()` store action
- `weightedBy` on Finding with badge rendering
- Weight passthrough on ResolvedColumnData (engine functions don't yet accept weights — TODO comments in place)

### MICE wiring
- `runMICEImputation()` connecting engine's multipleImputation to UI
- `imputedValues` on ColumnDefinition (separate from immutable rawValues)
- resolveColumn uses imputedValues when nullMeaning === 'missing'
- MICE option in MissingDataPanel with apply/re-run flow
- `imputeColumnMedian()` + auto-imputation for ≤5% missing

### Missing data cleanup
- Removed ghost `MissingDataStrategy` type and `applyMissingStrategy()` (declared strategy, never enforced)
- Replaced strategy picker with honest "How empty cells are handled" panel
- `readyToAnalyze` gate now `pendingFlagCount === 0` instead of strategy selection

### Temporal plugins
- `TrendPlugin` — line chart with rolling average, trend direction (increasing/decreasing/flat)
- `PeriodGroupPlugin` — response volume bar chart per period
- `TimeSegmentPlugin` — KW test across time periods with guards
- Extended timestamp detection (Unix seconds/ms, Excel serial dates)
- `timeUtils.ts` and `temporalAnalysis.ts` — parse, group, detect granularity
- Wired into TaskProposer Pass 2 and CapabilityMatcher (temporal + continuous)

### MR-2 plugins
- `OrdinalRegressionPlugin` with `parallelLinesTest()` precondition
- `MediationPlugin` with `bootstrapIndirectEffect()` (1000 bootstrap samples)
- `ModerationPlugin` with `johnsonNeyman()` regions of significance

### MR-3 power analysis
- `powerTTest()`, `powerANOVA()`, `powerCorrelation()`, `powerChiSq()` — all four engine functions
- `PowerAnalysisPlugin` — single plugin handling all test types, manual-only
- Two modes: required N (given effect + power) and achieved power (given N)

### Cross-validation and model diagnostics
- `kFoldCVLinear()` and `kFoldCVLogistic()` with seeded shuffle
- Wired into RegressionPlugin and DriverPlugin
- Overfit detection (training R² - CV R² > 0.1)
- AIC/BIC/logLikelihood added to linearRegression
- `computeAUC()` for logistic ROC-AUC

### PostAnalysisVerifier
- `checkSimpsonsParadox()` — direction reversal within segment strata
- `checkModeration()` — effect size variation across strata
- Wired into both HeadlessRunner and InteractiveRunner
- `attachVerificationResult()` on FindingsStore

### Two-layer language system (v12)
- **plainLanguage** — detailed, for finding cards in results view. May include test names, effect sizes, caveats.
- **summaryLanguage** — punchy 1-2 sentences for TLDR and report. No test names, no Greek letters, no p-values. Names actual columns, gives one key number.
- `summaryLanguage: string` on Finding — populated by each plugin, falls back to first sentence of summary
- TLDRReport rewritten: assembled from summaryLanguage, sorted by effect size, grouped by METHOD_GROUPS section. Mini-charts inline (160px). Key metric pills. Copy per finding + Copy All buttons.
- `assembleTLDR()` pure function — filters by significance/effect threshold, sorts DESC, groups by method section
- `SectionSummaryCard` below each MethodSection in results — shows top 1-2 summaryLanguage strings with "See executive summary" link
- Cross-type badge ("Survey × Behavioral") on TLDR findings with crossType: true

### Plain language and report
- All 18 plugin `plainLanguage()` methods rewritten for researcher readability
- Effect size magnitude labels
- `reportPriority` on all plugins
- `getOrderedForReport()` on FindingsStore
- TLDRReport with executive summary, tier-based layout, warnings section
- `buildAutoReportSchema()` for exportable schema
- `buildExecutiveSummary()` per priority tier
- DataSummaryCard — "What's in your data" orientation card

### Explorer and sandbox
- ExplorerPanel with 3 zones (column picker, analysis buttons, inline results)
- SelectionStore with reactive capabilities
- RowFilterBar with 5 operators
- Pin-to-report flow
- Suggested questions (5 rules, max 6 questions)

### Bulk tagging
- BulkTaggerTable — compact table for 8+ column datasets
- Confidence scoring (auto-confirm high-confidence types)
- Ambiguous name detection (col1, field, x, etc.)
- Inline expansion for review items

### Results page — method-grouped layout
- Results now grouped by analysis method (Distributions → Reliability → Group Comparisons → Correlations → Trends → Drivers → Advanced → Factor → Other)
- `METHOD_GROUPS` in `src/results/methodGroups.ts` maps each pluginId to a section key
- `groupFindings()` in `src/results/groupFindings.ts` — pure function, no store imports, groups findings into `MethodSectionData[]`
- Each section contains `QuestionGroupData[]` — question blocks with findings, charts, and plain language
- PostHoc findings automatically attach to their parent KW significance group (matched by overlapping source columns)
- Non-significant question blocks render collapsed with muted styling
- Sections with 4+ question blocks make each block collapsible
- `FlagsStrip` — dismissible banner showing Simpson's Paradox / moderation warnings from PostAnalysisVerifier
- `ResultsPageHeader` — collapse/expand all toggle + total counts
- Finding enrichment: `sourceTaskId`, `sourceColumns`, `sourceQuestionLabel` on Finding type (populated in DataWorkspace)
- `StepCard` component preserved — still used for InteractiveRunner step-by-step mode

### Behavioral analysis improvements (data-shape-aware method selection)
- **DescriptivesPlugin** (plugin #19): histogram + box plot + describe() for behavioral metrics. Detects skew and zero-inflation. Auto-proposed for behavioral columns in TaskProposer Pass 1.
- **CorrelationPlugin**: auto-switches to Spearman rank correlation when any column has |skewness| > 2. Notes method in findings and plain language.
- **SegmentProfilePlugin**: computes median + nonZeroRate per group for skewed/zero-inflated columns. Charts switch to median. Plain language leads with conversion rate.
- **RegressionPlugin**: applies log1p to spend outcomes with |skewness| > 2. Warns for all skewed outcomes. Notes transformation in flags and plain language.
- **Known gaps documented in** `docs/handoff/BEHAVIORAL_ANALYSIS_GAPS.md`: Poisson regression for counts, two-part hurdle model for spend, percentile segmentation, box plot comparison charts.

### Alchemer checkbox grid support
- New QuestionType `'multi_response'` — checkbox grid where each column is one option (code if selected, null if not)
- `isAlchemerCheckboxColumn()` and `isAlchemerCheckboxGrid()` in `inferColumnType.ts` — detects high-null, single-code-value columns with shared prefix
- Auto-detection in QuestionBlockCard: 3+ columns matching pattern → prompt "Looks like a checkbox grid"
- `resolveColumn()` normalizes Alchemer format: non-null → 1, null → 0 (rawValues immutable, normalization in resolved output only)
- `nullMeaning` auto-set to `'not_chosen'` — MissingDataPanel and MICE exclude these columns
- `CapabilityMatcher` emits `'multiple_response'` + `'categorical'` for `multi_response` columns
- `WITHIN_QUESTION_RULES.multi_response`: allows frequency + crosstab, blocks regression/correlation/cronbach/efa/KW/mediation/moderation/point-biserial
- Type picker: "Checkbox or Yes/No" relabeled, "Checkbox grid (select all that apply)" added to SELECTABLE_TYPES

### Behavioral Dataset block
- New block role: `'behavioral'` alongside `'question'`, `'segment'`, `'weight'`
- `behavioralRole?: 'metric' | 'dimension'` on `ColumnDefinition` — determines whether a column is analyzed or used as split
- `+ Add Behavioral Data` button in QuestionBlockEntry creates a behavioral block
- Per-column type inference via `inferColumnType()` runs on paste — sets type and default role
- Per-column role toggle (Metric / Dimension) in QuestionBlockCard for behavioral blocks
- `setBehavioralRole()` store action on datasetGraph for post-confirmation changes
- BulkTaggerTable extended: Role toggle column shown when behavioral blocks present, "Mark all continuous as Metric" bulk action
- TaskProposer refactored: `allAnalyzable` = question blocks + metric columns from behavioral blocks. Segment blocks excluded from allAnalyzable entirely. Dimension columns from behavioral blocks available as split variables.
- Segment block continuous column warning: when inferColumnType detects continuous columns in a segment block, shows inline warning suggesting Behavioral block instead

### UI improvements
- FindingCard restructured: headline → key metrics → collapsed stats → flags
- Subgroup badge, weighted badge, MICE badge on findings
- Cross-type bridge proposals in TaskProposer (survey × behavioral)
- Cell editing in PasteGrid with SingleValueOverrideTransform

---

## What still not to implement

- CFA (Confirmatory Factor Analysis) — requires SEM framework, separate architectural decision
- Conjoint analysis — heavy computation, separate decision
- On-premise / self-hosted Supabase — only if a specific client requires it
- Weighted engine functions — the plumbing is in place (weights flow to plugins) but the engine statistical functions (linearRegression, kruskalWallis, correlationMatrix, etc.) don't yet accept weights. This is the next engine-level task.
