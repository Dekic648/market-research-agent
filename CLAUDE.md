# CLAUDE.md — v2
## Market Research Stats Toolkit — Phase 1+ Context

> **This replaces CLAUDE.md at the repo root once Phase 0 is confirmed complete.**  
> Phase 0 done condition: `npm run build` passes, `npx vitest run` passes all scipy-validated tests.

---

## What exists at this point

Phase 0 produced:

```
v2/src/engine/
  stats-engine.ts         ← 59 methods, typed, DOM-free
  stats-engine.worker.ts  ← Web Worker wrapper
  workerClient.ts         ← typed async wrapper for components
  types.ts                ← typed result interfaces for all 59 functions

v2/src/parsers/
  ParserRegistry.ts
  adapters/
    PasteGridAdapter.ts   ← extracted from v1 analyze.html

v2/src/types/
  dataTypes.ts            ← ColumnDefinition, DatasetGraph, PastedData etc.

v2/src/stores/
  datasetGraph.ts         ← replaces DataStore
  sessionStore.ts
  chartStore.ts
  findingsStore.ts        ← typed API, add() only
  analysisLog.ts          ← append-only, immutable
  selectors.ts

v2/tests/
  engine/                 ← all scipy tests passing
```

The 7 non-negotiable rules from v1 CLAUDE.md still apply in full. They are repeated below for reference.

---

## Current build phase

Work through phases in order from `v2/docs/handoff/handoff_spec.md`.

Phase 0 complete. Next: **Phase 1 — ColumnFingerprint**, then Phase 2 — TransformationStack + resolveColumn, then Phases 3–5 — DetectionLayer.

---

## Non-negotiable rules — unchanged from v1

### 1. rawValues are immutable
Written once in `PasteGridAdapter.parse()`. Never written to again. All analysis receives `resolveColumn()` output only.

### 2. Stats Engine is pure functions in a Web Worker
Zero React, Zustand, or DOM imports in `src/engine/`. Components call via `workerClient.ts` only.

### 3. New analysis types register — never modify CapabilityMatcher
Write a plugin in `src/plugins/`, call `AnalysisRegistry.register()`. Never edit `CapabilityMatcher.ts` to add a type.

### 4. Exactly 5 Zustand stores
`datasetGraph`, `sessionStore`, `chartStore`, `findingsStore`, `analysisLog`. No sixth without ADR. No cross-slice imports — use `selectors.ts`.

### 5. Three AnalysisLog fields that can never be omitted
`userId`, `dataFingerprint`, `dataVersion` on every entry. No exceptions.

### 6. FindingsStore.add() only
`pushFinding()` does not exist.

### 7. All stores JSON-serializable at all times
`JSON.parse(JSON.stringify(store.getState()))` must not throw. Serialization test in `tests/stores/serialization.test.ts` must always pass.

---

## New in this version — Charts

Every chart in v2 is a typed config object stored in `ChartStore`. No chart component reads from `rawValues` or calls `resolveColumn()` directly. Data flows from `StepResult` → `ChartStore` → `PlotlyChart`.

**Library:** Plotly.js

**Every chart is this shape — no exceptions:**

```typescript
interface ChartConfig {
  id: string
  type: ChartType
  data: Plotly.Data[]
  layout: Partial<Plotly.Layout>
  config: Partial<Plotly.Config>
  stepId: string       // which analysis step produced this
  edits: ChartEdits    // user overrides — title, labels, colors
}

interface ChartEdits {
  title?: string
  xAxisLabel?: string
  yAxisLabel?: string
  colors?: string[]
  legendPosition?: 'top' | 'bottom' | 'right'
}
```

**Chart types to implement — in priority order:**

```typescript
type ChartType =
  | 'divergingStackedBar'   // market research classic — 1-2-3-4-5 centered
  | 'groupedBar'            // items × segments
  | 'horizontalBar'         // means, betas, selection rates
  | 'significanceMap'       // -log10(p) bars with threshold line
  | 'heatmap'               // correlation matrix, crosstab with color
  | 'betaImportance'        // standardized coefficients sorted
  | 'radarChart'            // segment profiles
  | 'boxPlot'               // distribution by segment
  | 'scatterPlot'           // correlation, predicted vs actual
  | 'stackedPercentBar'     // 100% stacked per segment
  | 'histogram'             // distribution with mean/median lines
```

**Base Plotly config — apply to all charts:**

```typescript
const baseConfig: Partial<Plotly.Config> = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  toImageButtonOptions: {
    format: 'png',
    height: 600,
    width: 900,
    scale: 2,
  },
}
```

**How chart editing works:**

```
StepResult produced by analysis
        ↓
ChartContainer renders PlotlyChart with default config
        ↓
User clicks "Edit" → ChartEditor panel opens
        ↓
Edits stored in ChartStore.chartConfigs[chartId].edits
        ↓
PlotlyChart re-renders with merged config (default + edits)
        ↓
ChartStore.configs readable by ReportRenderer at export time
```

**Rule:** `ChartStore` holds configs only — no raw data, no analysis results. If you need to re-render a chart, the data comes from `SessionStore.stepResults`, the config comes from `ChartStore`.

---

## New in this version — Analysis display layer

Each analysis step renders as a `StepCard`. This is the output the researcher sees.

**StepCard component hierarchy:**

```
StepCard
├── StepHeader          ← step number, title, description
├── PlainLanguageCard   ← green card — interpretation from plugin.plainLanguage()
├── MetricsRow          ← key numbers: mean, n, p-value, effect size
├── ChartContainer      ← Plotly chart + edit button + download button
├── DataTable           ← sortable results table with heatmap coloring
├── EffectSizeCard      ← "ε² = 0.08 (medium) — explains 8%"
├── CollapsibleDetails  ← technical stats, hidden by default
└── NextStepButton      ← carries session forward to next step
```

**Rule:** `PlainLanguageCard` text comes from `plugin.plainLanguage(result)` — never hardcoded in the component. The plugin owns its interpretation.

---

## New in this version — AnalysisPlugin contract

Now that the engine and stores exist, plugins can be built. Every analysis is an `AnalysisPlugin` that self-registers.

```typescript
interface AnalysisPlugin {
  id: string
  title: string
  desc: string
  requires: DataCapability[]       // what the CapabilityMatcher checks
  preconditions: Validator[]       // checked BEFORE run — normality, min N, VIF
                                   // violations surface on button, never silent in HeadlessRunner
  run(data: ResolvedColumnData, weights?: number[]): Promise<StepResult>
  produces: OutputContract
  plainLanguage(result: StepResult): string   // lives HERE, not in a shared file
  tests: TestCase[]                // ships with the plugin — CI refuses merge without passing
}
```

**Plugin build order** — matches the existing flow files in v1:

```
1. FrequencyPlugin      ← distribution, Top2/Bot2, net score
2. CrosstabPlugin       ← % by segment, index values, sig letters
3. SignificancePlugin   ← KW/ANOVA, effect size, significance map
4. PostHocPlugin        ← pairwise MW, Bonferroni, mean plot with CI
5. ReliabilityPlugin    ← Cronbach α — reads reverseCode flag from ColumnDefinition
6. FactorPlugin         ← EFA, scree plot, loadings
7. RegressionPlugin     ← linear/logistic, R², beta chart
8. DriverPlugin         ← all predictors → outcome, importance ranking
9. CorrelationPlugin    ← Pearson/Spearman matrix, heatmap
10. PointBiserialPlugin ← binary × continuous
11. SegmentProfilePlugin ← per-segment cards, radar vs average
```

---

## New in this version — two runner modes

`StepRunner` from v1 is replaced by two explicit classes sharing one interface:

```typescript
interface IStepRunner {
  run(plugin: AnalysisPlugin, session: SessionState): Promise<StepResult>
  onProgress?: (step: number, total: number) => void
  onViolation?: (violation: AssumptionViolation) => void
}

class InteractiveRunner implements IStepRunner {
  // Awaits human review between steps
  // Renders NextStepButton — does not auto-advance
  // Shows assumption violations inline — does not block
}

class HeadlessRunner implements IStepRunner {
  // Runs all steps without UI interaction
  // Assumption violations written to AnalysisLog, finding flagged — NEVER silent
  // Progress reported via onProgress callback
  // Used for "run all" mode
}
```

**Decision required before building:** is HeadlessRunner a power-user shortcut (Option A) or the primary flow (Option B)? This must be decided explicitly — do not default to either. Ask if unclear.

---

## New in this version — SelectionStore

For the "pick data, click analysis button" mode. Completely isolated from SessionStore.

```typescript
interface DataSelection {
  columns: ColumnDefinition[]
  rowFilter: FilterExpression | null
  cellRange: CellRange | null
  sourceDataset: DatasetNode
}
```

`SelectionStore` never imports from `SessionStore`. `AnalysisButtonPanel` is a reactive view of `CapabilityMatcher.resolve(currentSelection)` — green buttons for runnable analyses, grey with reason for blocked ones. Results surface inline below the grid. User pins to `FindingsStore` if wanted.

---

## Session persistence — implement in Phase 8

```typescript
// Three IndexedDB object stores via idb package
'sessions'    key: 'current'   value: all store state except rawValues
'columnData'  key: columnId    value: rawValues[] per column
'analysisLog' key: entryId     value: AnalysisLogEntry

// Auto-save: subscribe to datasetGraph, debounce 2000ms
// Auto-restore: check IndexedDB on load before rendering empty state

// Session file: .mrst format
// JSON.stringify(all stores) → gzip → download as session_YYYY-MM-DD.mrst
```

---

## What NOT to implement yet

- Qualtrics / SPSS / SurveyMonkey parser adapters — need sample data files
- ReportSchema + ReportRenderer — 2-year horizon
- DatasetGraph multi-node flows — single-node must be stable first
- Supabase — after IndexedDB confirmed working
- CFA (Confirmatory Factor Analysis) — requires SEM framework, separate decision

---

## Reference documents

All in `v2/docs/handoff/`:

| Document | When to read it |
|---|---|
| `handoff_spec.md` | Phase-by-phase implementation, component specs, test cases |
| `ARCHITECTURE_UPDATED.md` | Full target architecture |
| `prevention_spec.md` | Why specific decisions matter |
| `spss_gaps.html` | Statistical methods to build, priority order |
| `architecture_headaches.html` | Future traps, field stubs to include now |
