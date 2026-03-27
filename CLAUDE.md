# CLAUDE.md — v3
## Market Research Stats Toolkit — Analysis Plugin Phase

> **Swap this in when:** Phases 1–3 are confirmed complete.
> Phase 1 done: all 5 stores typed, serialization test passes, `@ts-nocheck` removed from stats-engine.ts, `weights?` added to aggregation functions.
> Phase 2 done: `ColumnFingerprint` implemented, all fingerprint tests pass.
> Phase 3 done: `TransformationStack` types exist, `resolveColumn()` implemented, all transform tests pass, zero direct `rawValues` access in analysis calls.

---

## What exists at this point

```
v2/src/
├── engine/
│   ├── stats-engine.ts         — fully typed, no @ts-nocheck, weights? added
│   ├── stats-engine.worker.ts
│   ├── workerClient.ts
│   ├── resolveColumn.ts        — pure function, single chokepoint
│   ├── types.ts                — typed interfaces for all 59 functions
├── parsers/
│   ├── ParserRegistry.ts
│   ├── fingerprint.ts          — ColumnFingerprint, diffFingerprints, matchColumns
│   ├── adapters/
│       ├── PasteGridAdapter.ts
├── types/
│   ├── dataTypes.ts            — complete
│   ├── transforms.ts           — full Transform union type
├── stores/
│   ├── datasetGraph.ts         — with addTransform, toggleTransform, snapshotStack
│   ├── sessionStore.ts
│   ├── chartStore.ts
│   ├── findingsStore.ts
│   ├── analysisLog.ts
│   ├── selectors.ts
```

All 7 non-negotiable rules from v1/v2 still apply in full.

---

## Current priority — build analysis plugins

The infrastructure is done. The next layer is the `AnalysisPlugin` system — replacing the hardcoded `determineFlows()` and `STEP_REGISTRY` from v1.

---

## AnalysisPlugin contract — full specification

Every analysis is an `AnalysisPlugin`. Self-describing, self-testing, self-registering.

```typescript
// src/plugins/types.ts
interface AnalysisPlugin {
  id: string
  title: string
  desc: string

  requires: DataCapability[]
  // DataCapability values: 'continuous' | 'categorical' | 'ordinal' | 'binary'
  // | 'segment' | 'repeated' | 'n>30' | 'n>100' | 'text' | 'temporal'
  // | 'multiple_response' | 'weighted'

  preconditions: Validator[]
  // Checked BEFORE run. Violations surface on button with reason.
  // In HeadlessRunner: violations written to AnalysisLog, finding flagged — never silent.

  run(data: ResolvedColumnData, weights?: number[]): Promise<StepResult>
  // data = resolveColumn() output — never rawValues

  produces: OutputContract
  // Typed shape of StepResult.data — used by ChartContainer and DataTable

  plainLanguage(result: StepResult): string
  // Interpretation lives HERE — never in a shared file, never in a component

  tests: TestCase[]
  // CI refuses to merge a plugin without passing tests
}
```

### AnalysisRegistry

```typescript
// src/plugins/AnalysisRegistry.ts
const AnalysisRegistry = {
  register(plugin: AnalysisPlugin): void,
  query(capabilities: CapabilitySet): AnalysisPlugin[],
  // Returns runnable plugins for given capabilities — ordered by priority
  // Knows no plugin by name — pure capability matching
}
```

**Rule:** if you are adding a condition to `CapabilityMatcher.ts` that mentions a plugin by name, stop. Write a plugin instead.

---

## CapabilityMatcher — replaces determineFlows()

```typescript
// src/engine/CapabilityMatcher.ts
const CapabilityMatcher = {
  resolve(source: DatasetGraph | DataSelection): CapabilitySet
  // Reads data types, column counts, n, segment presence
  // Returns flat capability list — never evaluates plugin names
  // AnalysisRegistry.query(capabilities) does the matching
}
```

`CapabilityMatcher` knows no plugin by name. `AnalysisRegistry` knows all plugins. Neither knows about each other's internals.

---

## Plugin build order

Build in this exact order — each one tests a new part of the infrastructure.

### Batch 1 — descriptive and comparison (build first)

```
FrequencyPlugin      id: 'frequency'
  requires: ['categorical' | 'ordinal']
  produces: FrequencyResult — { values, counts, pcts, top2box, bot2box, netScore }
  charts: ['divergingStackedBar', 'horizontalBar']
  plainLanguage: "X% rated [item] positively (Top 2 Box)"

CrosstabPlugin       id: 'crosstab'
  requires: ['categorical' | 'ordinal', 'segment']
  produces: CrosstabResult — { table, indexValues, sigLetters }
  charts: ['heatmap', 'groupedBar']

SignificancePlugin   id: 'kw_significance'
  requires: ['continuous' | 'ordinal', 'segment']
  produces: SignificanceResult — { perColumn: { H, p, df, epsilonSquared }[] }
  charts: ['significanceMap', 'groupedBar']
  preconditions: [minGroupSize(5)]

PostHocPlugin        id: 'posthoc'
  requires: ['continuous' | 'ordinal', 'segment']
  dependsOn: ['kw_significance']
  produces: PostHocResult — { pairwise: MWResult[][], bonferroniAdjusted: boolean }
  charts: ['horizontalBar']
```

### Batch 2 — scale analysis

```
ReliabilityPlugin    id: 'cronbach'
  requires: ['ordinal', 'n>30']
  produces: CronbachResult — { alpha, itemTotal[], alphaIfDeleted[] }
  IMPORTANT: reads ColumnDefinition.transformStack for reverseCode flags
             reversed items are handled automatically — do not re-reverse

FactorPlugin         id: 'efa'
  requires: ['ordinal', 'n>100']
  produces: FactorResult — { loadings, eigenvalues, varianceExplained, screePlot }
  charts: ['scatterPlot']
  preconditions: [minN(100), kmo(0.6)]
```

### Batch 3 — regression and prediction

```
RegressionPlugin     id: 'regression'
  requires: ['continuous', 'n>30']
  produces: RegressionResult — already typed in engine/types.ts
  charts: ['betaImportance', 'scatterPlot']
  preconditions: [vifCheck(10), normalityOfResiduals]

DriverPlugin         id: 'driver_analysis'
  requires: ['continuous', 'segment', 'n>100']
  dependsOn: ['regression']
  produces: DriverResult — { predictors: { name, beta, importance }[] }
  charts: ['betaImportance']
```

### Batch 4 — correlation and profiles

```
CorrelationPlugin    id: 'correlation'
  requires: ['continuous']
  produces: CorrelationResult — { matrix, pValues }
  charts: ['heatmap', 'scatterPlot']

PointBiserialPlugin  id: 'point_biserial'
  requires: ['binary', 'continuous']
  produces: PointBiserialResult — { r, p, meanGroup0, meanGroup1 }

SegmentProfilePlugin id: 'segment_profile'
  requires: ['continuous' | 'ordinal', 'segment']
  produces: SegmentProfileResult — { perSegment: { label, means, vsAverage }[] }
  charts: ['radarChart', 'groupedBar']
```

---

## FlowRegistry — replaces FLOW_REGISTRY

```typescript
// src/engine/FlowRegistry.ts
interface FlowDefinition {
  id: string
  label: string
  pluginSequence: string[]    // plugin IDs in execution order
  requires: DataCapability[]  // what data must be present to trigger this flow
  priority: number
  dependsOn?: string[]        // other flow IDs that must complete first
}

// Example:
const RatingWithSegmentFlow: FlowDefinition = {
  id: 'rating_segment',
  label: 'Rating + Segments',
  pluginSequence: ['frequency', 'crosstab', 'kw_significance', 'posthoc'],
  requires: ['ordinal', 'segment'],
  priority: 1,
}
```

Flows self-declare their plugin sequences. `CapabilityMatcher` determines which flows can run. No hardcoded conditions anywhere.

---

## StepResult shape — all plugins return this

```typescript
interface StepResult {
  pluginId: string
  data: unknown                    // typed by plugin's OutputContract
  charts: ChartConfig[]            // ready to render — data + layout + config
  findings: FindingInput[]         // passed to FindingsStore.add()
  plainLanguage: string            // from plugin.plainLanguage(this)
  assumptions: AssumptionCheck[]   // passed/failed preconditions
  logEntry: Partial<AnalysisLogEntry>  // caller completes with userId, fingerprint, version
}
```

---

## Chart generation — how plugins produce charts

Plugins produce `ChartConfig` objects inside `StepResult.charts`. They never render anything. `ChartContainer` reads the config and passes it to `PlotlyChart`.

```typescript
// Inside a plugin's run() function:
const charts: ChartConfig[] = [
  {
    id: `${pluginId}_diverging_${Date.now()}`,
    type: 'divergingStackedBar',
    data: buildDivergingData(result),   // pure function, returns Plotly.Data[]
    layout: {
      title: { text: scaleGroup.label },
      barmode: 'relative',
    },
    config: baseConfig,   // imported from src/engine/chartDefaults.ts
    stepId: pluginId,
    edits: {},            // empty — user fills these via ChartEditor
  }
]
```

Create `src/engine/chartDefaults.ts` with the base Plotly config:

```typescript
export const baseConfig: Partial<Plotly.Config> = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  toImageButtonOptions: { format: 'png', height: 600, width: 900, scale: 2 },
}

export const darkLayout: Partial<Plotly.Layout> = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, sans-serif', size: 12 },
  margin: { l: 60, r: 20, t: 50, b: 80 },
}
```

---

## Runner split — build now

```typescript
// src/runners/IStepRunner.ts
interface IStepRunner {
  run(plugin: AnalysisPlugin, session: SessionState): Promise<StepResult>
  onProgress?: (step: number, total: number) => void
  onViolation?: (violation: AssumptionViolation) => void
}

// src/runners/InteractiveRunner.ts
// Awaits human review. Renders NextStepButton. Does not auto-advance.
// Assumption violations shown inline — user decides whether to proceed.

// src/runners/HeadlessRunner.ts
// Runs all plugins without UI. Progress via onProgress callback.
// Assumption violations → AnalysisLog entry + finding flagged. NEVER silent.
```

**Before building:** confirm whether HeadlessRunner is Option A (power-user shortcut) or Option B (primary flow). Record the decision in a comment at the top of `HeadlessRunner.ts`. Do not default.

---

## What NOT to implement yet

- DetectionLayer semantic checks (Claude API) — statistical checks only for now
- DatasetGraph multi-node flows — single-node plugins must be stable first
- SelectionStore / AnalysisButtonPanel — after all 11 plugins work
- ReportSchema + ReportRenderer — next phase
- Supabase — after IndexedDB confirmed working
