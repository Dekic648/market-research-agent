# Architecture — Market Research Analysis Platform
## Updated Architecture Document

> **Document status:** This is the evolved architecture incorporating decisions made after the original spec. The original ARCHITECTURE.md remains valid for Blocks 3–5 (Stats Engine, Charts, Output Display) which are unchanged. Every other block has been extended or replaced. Read this document alongside the original — it is an amendment, not a rewrite.

---

## What changed and why — summary

| Original | Updated | Reason |
|---|---|---|
| `universalParser.ts` — one monolith | `ParserRegistry` — pluggable adapters | New data formats arrive constantly; each adapter is isolated |
| `DataStore` — one PastedData | `DatasetGraph` — nodes + edges | Wave-over-wave, benchmarks, multi-brand are core use cases |
| `determineFlows()` — hardcoded if/else | `CapabilityMatcher` + `AnalysisRegistry` | New analysis types must register, not modify central logic |
| `STEP_REGISTRY` — named list | `AnalysisPlugin` contract | Each analysis is self-describing and self-testing |
| `StepRunner` — one class | `InteractiveRunner` + `HeadlessRunner` | Semi-automation requires explicit modes, not a boolean flag |
| `findings.push()` — append only | `FindingsStore` typed API | Suppress, reorder, group are table-stakes client requests |
| `ReportBuilder.tsx` — component tree | `ReportSchema` + `ReportRenderer` | Report must be serializable, re-runnable, renderer-agnostic |
| No transformation layer | `TransformationStack` + `resolveColumn()` | Raw data immutability + non-destructive editing |
| No detection layer | `ColumnFingerprint` + `DetectionLayer` | Silent errors in scale direction are unacceptable in a stats tool |
| No session persistence | IndexedDB + exportable `.groundedly` file | Session portability before Supabase backend exists |
| No identity fields | `userId`, `createdBy`, `dataFingerprint` on all log entries | Cannot retrofit immutable log entries retroactively |

---

## Updated System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                             │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Data     │  │ Data     │  │ Analysis │  │ Output   │  │ Report   │ │
│  │ Input    │→ │ Prepare  │→ │ Flow     │→ │ Display  │→ │ Builder  │ │
│  │ Layer    │  │ Layer    │  │ Engine   │  │ Layer    │  │          │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│       │              │             │             │             │       │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       ZUSTAND STORES (governed)                  │ │
│  │  DatasetGraph | SelectionStore | SessionStore | FindingsStore    │ │
│  │  ChartStore   | TransformStack | AnalysisLog                     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                 │                                       │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                  STATS ENGINE (Web Worker — isolated)            │ │
│  │              resolveColumn() → pure functions → typed results    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### New step in the pipeline

```
PASTE → PARSE → FINGERPRINT → DETECT → TAG → PREPARE → ANALYZE → DISPLAY → REPORT
          │           │           │        │       │
    ParserRegistry  ColumnFP  DetectionLayer  TransformStack  CapabilityMatcher
```

---

## BLOCK 1: Data Input Layer (updated)

### What changed
`universalParser.ts` is replaced by `ParserRegistry`. The monolith is decomposed into isolated adapters that each output the same normalized `PastedData`. Two new steps are inserted after parse: fingerprinting and detection.

### Components

```
DataInput/
├── DataWorkspace.tsx              # unchanged
│   ├── PasteGrid.tsx              # virtual scrolling enabled (rowVirtualization: true)
│   ├── ColumnTagger.tsx           # now reads DetectionFlags → surfaces warnings per column
│   ├── DataPreview.tsx            # unchanged
│   ├── QuestionTypeCard.tsx       # now shows detected scaleRange vs declared scaleRange
│   ├── AddQuestionButton.tsx      # unchanged
│
├── parsers/
│   ├── ParserRegistry.ts          # replaces universalParser.ts
│   │   ├── detect(raw) → format   # identifies format before delegating
│   │   ├── register(adapter)      # adapters self-register at import
│   │   ├── parse(raw) → PastedData + ColumnFingerprint[]
│   │
│   ├── adapters/
│   │   ├── PasteGridAdapter.ts    # current universalParser logic, extracted
│   │   ├── QualtricsAdapter.ts    # Qualtrics export format (double headers)
│   │   ├── SPSSAdapter.ts         # SPSS .sav export
│   │   ├── SurveyMonkeyAdapter.ts # SurveyMonkey CSV format
│   │
│   └── [client adapters register here → never modify existing adapters]
│
├── fingerprint/
│   ├── fingerprint.ts             # NEW → see Component 1 in handoff_spec.md
│       ├── computeFingerprint(values, columnId) → ColumnFingerprint
│       ├── diffFingerprints(prev, next) → FingerprintDiff
│       ├── matchColumns(source[], target[]) → ColumnMatch[]
│
├── detection/
│   ├── detectionLayer.ts          # NEW → orchestrator, see handoff_spec.md
│   ├── statisticalChecks.ts       # deterministic → no API, < 100ms per column
│   ├── semanticChecks.ts          # Claude API → once per scale group at tagging, cached
│
└── types/
    └── dataTypes.ts               # extended → see type changes below
```

### ColumnDefinition — updated type

```typescript
interface ColumnDefinition {
  // Original fields — unchanged
  id: string
  name: string
  type: QuestionType
  nRows: number
  nMissing: number

  // New fields — add these, do not remove originals
  rawValues: (number | string | null)[]    // immutable after parse → never written to
  fingerprint: ColumnFingerprint           // computed at parse time
  semanticDetectionCache: DetectionSource[] | null  // Claude API result, cached
  transformStack: Transform[]              // ordered, applied by resolveColumn()
  sensitivity: 'anonymous' | 'pseudonymous' | 'personal'  // GDPR → default 'anonymous'
  declaredScaleRange: [number, number] | null  // user-declared, may differ from detected
}
```

### QuestionType — extended

```typescript
type QuestionType =
  | 'rating' | 'matrix' | 'checkbox' | 'radio'   // original
  | 'category' | 'behavioral'                      // original
  | 'verbatim'        // free text / open-ended → emits 'text' capability, never numeric
  | 'timestamped'     // date/time column → emits 'temporal' capability
  | 'multi_assigned'  // pipe/comma-separated codes → exploded to binary matrix
  | 'weight'          // respondent weight column → travels with dataset node
```

### Key rules — updated

**Rule 1 (unchanged):** The parser NEVER removes rows. Empty cells stay as `null`.

**Rule 2 (new):** `rawValues` are immutable after parse. No component writes to `rawValues` after `ParserRegistry.parse()` completes. Transformations are applied by `resolveColumn()` at analysis time, never stored back.

**Rule 3 (new):** Every column gets a `ColumnFingerprint` at parse time. Fingerprints are computed inside the adapter before `PastedData` is returned. They are never recomputed — if data changes, a new fingerprint is computed for the new data.

**Rule 4 (new):** `sensitivity` defaults to `'anonymous'`. Claude API calls in `semanticChecks.ts` must check `column.sensitivity === 'anonymous'` before firing. Personal or pseudonymous columns are never sent to external APIs.

---

## BLOCK 1.5: Data Preparation Layer (new)

### Purpose
Non-destructive transformation between raw data and the Stats Engine. Sits between tagging and analysis. Three operations require in-app declaration — missing data strategy, which is the only mandatory step. Reverse coding and computed variables are detected passively and declared via the TransformationStack.

### Position in pipeline

```
TAG COLUMNS → [DATA PREPARATION] → CAPABILITY MATCHER → ANALYSIS
                      │
              mandatory: missing data strategy
              passive: detection flags surfaced here
              optional: transform stack editor per column
```

### Components

```
DataPreparation/
├── PrepWorkspace.tsx              # three-panel layout (see data_prep_ui.html)
│   ├── MissingDataPanel.tsx       # MANDATORY → Little's MCAR, per-variable %, strategy
│   ├── RecodePanel.tsx            # reverse coding → pre-populated from DetectionFlags
│   ├── ComputePanel.tsx           # computed variables → formula editor + column chips
│
├── ColumnEditor/                  # side panel, opens per column or scale group
│   ├── TransformStackView.tsx     # shows stack items, toggle/edit/delete each
│   ├── TransformBuilder.tsx       # add new transform from typed menu
│   ├── RawVsResolvedView.tsx      # side-by-side raw values and resolved values
│
└── PrepLog.tsx                    # always-visible strip → shows declared strategy,
                                   # pending flags, "run analysis" button
```

### TransformationStack — types

```typescript
// All transform types → resolveColumn() applies these in order
type Transform =
  | ReverseCodeTransform      // { scaleMin, scaleMax } → newVal = min+max-oldVal
  | LabelMapTransform         // { map: {1:'NonPayer'} | {1:{en:'NonPayer',de:'...'}} }
  | ComputeVariableTransform  // { formula: string, parsedFormula: AST, outputColumnId }
  | RecodeRangeTransform      // { rules: [{from:[1,2], to:1},...] }
  | LogTransform              // { base, handleZero, constant }
  | ZScoreTransform           // uses fingerprint mean/SD → not recomputed
  | WinsorizeTransform        // { lowerPct, upperPct }
  | InteractionTermTransform  // { columnA, columnB, centered, outputColumnId }

interface BaseTransform {
  id: string
  enabled: boolean
  createdAt: number
  createdBy: string          // 'user' | 'auto-detected' | userId
  source: 'user' | 'auto-detected'
  logEntry: string
}
```

### resolveColumn() — the only applier

```typescript
// src/engine/resolveColumn.ts
function resolveColumn(
  definition: ColumnDefinition,
  stackOverride?: Transform[]   // for per-run snapshots
): (number | string | null)[]
```

Every analysis call passes column data through `resolveColumn()` before touching it. This is the single chokepoint. Raw values are never accessed directly by analysis code.

---

## BLOCK 2: Analysis Flow Engine (replaced)

### What changed
`FlowDetermination.ts` and `STEP_REGISTRY` are deleted. `determineFlows()` is replaced by `CapabilityMatcher`. Steps are replaced by `AnalysisPlugin` objects that self-register. `StepRunner` is split into `InteractiveRunner` and `HeadlessRunner`.

### Components

```
FlowEngine/
├── AnalysisRegistry.ts         # replaces STEP_REGISTRY + FLOW_REGISTRY
│   ├── register(plugin)        # called at plugin import → engine never imports plugins directly
│   ├── query(capabilities)     # returns runnable plugins for a given CapabilitySet
│
├── CapabilityMatcher.ts        # replaces determineFlows()
│   ├── resolve(DatasetGraph) → CapabilitySet     # auto-flow path
│   ├── resolve(DataSelection) → CapabilitySet    # selection mode path
│
├── DataTypeRegistry.ts         # new → data types register their capabilities
│   ├── register(dataType)
│   ├── capabilities: { verbatim: ['text'], timestamped: ['temporal', 'continuous'], ... }
│
├── runners/
│   ├── IStepRunner.ts          # shared interface
│   ├── InteractiveRunner.ts    # awaits human review between steps, NextStepButton
│   ├── HeadlessRunner.ts       # batch execution, progress bar, assumption violations
│                               # logged to AnalysisLog → NEVER proceeds silently on violation
│
├── plugins/                    # each plugin is a self-contained file
│   ├── FrequencyPlugin.ts
│   ├── CrosstabPlugin.ts
│   ├── SignificancePlugin.ts
│   ├── PostHocPlugin.ts
│   ├── ReliabilityPlugin.ts    # reads reverseCode flags from ColumnDefinition
│   ├── FactorPlugin.ts
│   ├── RegressionPlugin.ts
│   ├── DriverPlugin.ts
│   ├── CorrelationPlugin.ts
│   ├── PointBiserialPlugin.ts
│   ├── SegmentProfilePlugin.ts
│
└── SelectionMode/
    ├── SelectionStore.ts       # NEVER imports from SessionStore → fully isolated
    ├── AnalysisButtonPanel.tsx # reactive view of CapabilityMatcher.resolve(selection)
                                # green = runnable, grey = blocked with reason shown
```

### AnalysisPlugin contract

```typescript
interface AnalysisPlugin {
  id: string
  title: string
  desc: string

  requires: DataCapability[]         // what data capabilities are needed
  preconditions: Validator[]         // checked BEFORE run → normality, min N, VIF
                                     // violations surface on button, block headless silently = never

  run(data: ResolvedColumnData, weights?: number[]): StepResult
  //  → receives resolveColumn() output, not rawValues
  //  weights parameter → always accept, apply if present

  produces: OutputContract           // typed result shape
  plainLanguage(result: StepResult): string  // interpretation lives HERE, not in plainLanguage.ts
  tests: TestSuite                   // golden test cases → CI refuses merge without passing
}
```

### HeadlessRunner UX decision — record here

**This decision must be made before building the StepRunner split.**

- **Option A** (recommended for v1): Interactive is primary. HeadlessRunner is an advanced "run all" button. Most users never see it.
- **Option B**: Headless is the primary flow. User pastes, clicks Run, reviews completed report.

If Option B is chosen: `AnalysisLog`, assumption gating, and `resolveColumn()` must be complete and tested before HeadlessRunner ships. It cannot ship without them — it will produce silent wrong results.

### DataSelection mode

```typescript
interface DataSelection {
  columns: ColumnDefinition[]
  rowFilter: FilterExpression | null
  cellRange: CellRange | null
  sourceDataset: DatasetNode         // which node in DatasetGraph
}
```

`SelectionStore` holds the active `DataSelection`. `CapabilityMatcher.resolve(selection)` derives a `CapabilitySet` from it. `AnalysisButtonPanel` is a reactive view of that set — no logic in the component itself.

Results from selection-mode runs surface inline below the grid. User pins to `FindingsStore` if wanted. Every run logged to `AnalysisLog` regardless of entry point.

---

## BLOCK 3: Stats Engine (updated — mostly unchanged)

### What changed
Two additions only — everything else is preserved exactly.

**Addition 1:** Moves to a Web Worker. Physical isolation enforced at build time. Any import of `window`, `document`, or React inside the engine fails the build. The 1,400+ existing tests are unaffected.

**Addition 2:** Every function that computes means, frequencies, distributions, or group comparisons gains an optional `weights?: number[]` parameter. Weighted results are used when the column's dataset node carries a `weight` column. Unweighted behavior is unchanged when `weights` is absent.

```typescript
// example — existing signature
kruskalWallis(groups: number[][]): KWResult

// updated signature — backwards compatible
kruskalWallis(groups: number[][], weights?: number[][]): KWResult
```

**Addition 3:** `resolveColumn()` lives here as a pure function. It is the only entry point to column data for all analysis functions.

---

## BLOCK 4: DatasetGraph (replaces DataStore)

### Purpose
Replaces the single `DataStore` (one `PastedData`). Multi-dataset as a foundation — not a feature added later.

### Structure

```typescript
interface DatasetGraph {
  nodes: DatasetNode[]
  edges: DatasetEdge[]
}

interface DatasetNode {
  id: string
  label: string
  parsedData: PastedData             // columns + their TransformationStacks
  fingerprints: ColumnFingerprint[]
  detectionResult: DetectionResult
  weights: ColumnDefinition | null   // weight column travels with node
  readonly: boolean                  // true for benchmarks, imported references
  source: 'user' | 'platform_benchmark' | 'imported_reference'
  dataVersion: number                // increments on every re-paste or row addition
  createdAt: number
}

interface DatasetEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationship: 'same_survey' | 'wave_comparison' | 'external_reference' | 'benchmark'
  alignmentKey: string | null        // respondent ID column for row alignment
  alignmentValid: boolean            // false = cross-dataset flows blocked until resolved
}
```

---

## BLOCK 5: Zustand Store Governance

### Permitted slices — exactly five

```
DatasetGraph store    → replaces DataStore
SessionStore          → currentFlow, stepResults, flowIndex (unchanged)
ChartStore            → configs, edits, themes (unchanged)
SelectionStore        → DataSelection → never imports from SessionStore
FindingsStore         → typed API (see below)
AnalysisLog           → append-only, immutable
```

### Store governance rules

1. No slice imports from another slice directly. Cross-slice reads go through a `StoreSelector` layer.
2. A lint rule fails CI if a new Zustand slice is created without an ADR (Architecture Decision Record).
3. `SelectionStore` must never import from `SessionStore`. If this boundary breaks, store sprawl has started.
4. All stores must be fully serializable at all times — no DOM nodes, no functions as values, no circular references. This is the prerequisite for IndexedDB persistence and session file export.

### FindingsStore — typed API

```typescript
// replaces pushFinding() → which is deleted
FindingsStore.add(finding, { priority?, theme?, suppress?: boolean })
FindingsStore.reorder(findingId, afterId)
FindingsStore.suppress(findingId)
FindingsStore.groupByTheme() → FindingGroup[]
FindingsStore.filterByStep(stepId) → Finding[]
FindingsStore.applyFDRCorrection(method: 'bonferroni' | 'bh') → void
//  → post-accumulation pass → reads all p-values, writes adjusted values
//  requires all significance findings to be accumulated first
```

---

## BLOCK 6: AnalysisLog

### Purpose
Immutable, append-only record of every analysis run, every transformation action, every detection flag, and every data change. Cannot be edited after write. Every entry carries identity and data version fields — these cannot be retrofitted.

### Required fields on every entry

```typescript
interface AnalysisLogEntry {
  id: string                         // uuid
  type: LogEntryType
  timestamp: number
  userId: string                     // 'anonymous' until auth added → never null
  dataFingerprint: string            // hash of resolved dataset at this moment
  dataVersion: number                // DatasetNode.dataVersion at this moment
  sessionId: string
  payload: Record<string, unknown>   // type-specific data
}
```

### Entry types

```typescript
type LogEntryType =
  // Data events
  | 'parse_completed'        | 'fingerprint_computed'
  | 'fingerprint_diff'       | 'repaste_detected'
  | 'column_rename_migrated'

  // Detection events
  | 'detection_flag_raised'  | 'detection_flag_acknowledged'
  | 'detection_flag_dismissed'

  // Transformation events
  | 'transform_added'        | 'transform_toggled'
  | 'transform_removed'      | 'transform_snapshot'
  | 'missing_strategy_declared'

  // Analysis events
  | 'analysis_run'           | 'analysis_failed'
  | 'assumption_violation'   | 'sampling_applied'

  // Findings events
  | 'finding_added'          | 'finding_suppressed'
  | 'finding_reordered'      | 'fdr_correction_applied'

  // Session events
  | 'session_saved'          | 'session_loaded'
  | 'session_exported'
```

---

## BLOCK 7: Report Builder (updated)

### What changed
`ReportBuilder.tsx` is split into `ReportSchema` (data structure) and `ReportRenderer` (dumb executor). The component tree approach is replaced. `ReportBuilder.tsx` becomes a schema editor, not a renderer.

### Components

```
Report/
├── schema/
│   ├── ReportSchema.ts         # serializable JSON → the report definition
│   ├── schemaTypes.ts          # ReportSection, FindingRef, ChartRef, NarrativeNode
│
├── renderer/
│   ├── ReportRenderer.ts       # reads schema, emits target format → no logic
│   ├── PDFRenderer.ts          # React-PDF → unchanged
│   ├── PPTXRenderer.ts         # pptxgenjs → unchanged
│   ├── PresentationRenderer.ts # full-screen interactive → new renderer, same schema
│   ├── DOCXRenderer.ts         # optional
│
├── editor/
│   ├── ReportBuilder.tsx       # schema editor UI → replaces old ReportBuilder
│   ├── FindingsList.tsx        # reads FindingsStore, not raw findings array
│   ├── ChartSelector.tsx       # unchanged
│   ├── ReportEditor.tsx        # edits schema sections, not JSX
│
└── templates/
    ├── ExecutiveTemplate.ts    # schema object → not a React component
    ├── DetailedTemplate.ts     # schema object
    ├── PresentationTemplate.ts # schema object
```

### ReportSchema — key properties

```typescript
interface ReportSchema {
  id: string
  version: number
  createdAt: number
  createdBy: string                    // userId

  // Re-runnable → schema can be applied to new data
  sourceDatasetIds: string[]           // which DatasetGraph nodes produced this
  analysisLogSnapshot: string[]        // log entry IDs that produced findings

  sections: ReportSection[]
}

interface ReportSection {
  id: string
  type: 'executive_summary' | 'finding' | 'chart' | 'narrative' | 'segment_profile' | 'driver'
  showIf?: string                      // e.g. 'R2 > 0.3' → evaluated at render time
  theme?: string                       // per-client branding
  content: FindingRef | ChartRef | NarrativeNode | AIGeneratedNarrative
}

interface AIGeneratedNarrative {
  type: 'ai_narrative'
  prompt: string                       // template with finding references
  cachedResult: string | null          // cached → not regenerated on every render
  generatedAt: number | null
}
```

---

## Session Persistence (no backend required for v1)

### Strategy — three layers

```
IndexedDB          → crash recovery, auto-save on every meaningful state change
localStorage       → lightweight preferences, UI state, active theme
.groundedly file   → portable session export, client handoff, wave 2 re-run
```

### IndexedDB schema

```typescript
// stores
'sessions'     key: 'current'     value: SessionMetadata (no rawValues)
'columnData'   key: columnId      value: rawValues[]       (stored separately → large)
'analysisLog'  key: entryId       value: AnalysisLogEntry[]
```

### Session file format

A `.groundedly` file is a JSON serialization of all store states, gzipped. Contains:
- `DatasetGraph` (with `rawValues` per column)
- `SessionStore`
- `FindingsStore`
- `ChartStore`
- `AnalysisLog`
- Schema version

Rehydration: load file → validate schema version → restore all stores → `resolveColumn()` recalculates from `rawValues` + `transformStack`.

---

## Updated Data Flow — End to End

```
Step 1: PASTE
User pastes or uploads data
        →
Step 2: PARSE
ParserRegistry detects format → delegates to adapter → PastedData
        →
Step 3: FINGERPRINT
computeFingerprint() per column → stored in ColumnDefinition.fingerprint
If re-paste: diffFingerprints() → surface changes to user
        →
Step 4: DETECT
detectionLayer.runDetection() → DetectionFlag[]
Statistical checks (sync) + Claude API semantic checks (async, per scale group)
Flags stored in DataStore, surfaced in ColumnTagger
        →
Step 5: TAG
User confirms column types, scale ranges, scale groups
DetectionFlags pre-populate reverse-coding suggestions
        →
Step 6: PREPARE
User declares missing data strategy (mandatory)
User reviews/confirms/dismisses DetectionFlags
User adds transforms to TransformationStack if needed
All decisions logged to AnalysisLog
        →
Step 7: DETERMINE
CapabilityMatcher.resolve(DatasetGraph) → CapabilitySet
AnalysisRegistry.query(capabilities) → runnable plugins, ordered
        →
Step 8: ANALYZE (InteractiveRunner or HeadlessRunner)
runner.run(plugin, session):
  resolveColumn(definition) → resolved values
  plugin.preconditions checked → violations surfaced, never silent
  StatsEngine[function](resolved, weights?) → typed result
  FindingsStore.add(finding)
  AnalysisLog entry written with dataFingerprint
        →
Step 9: DISPLAY (unchanged)
StepCard renders PlainLanguage, Metrics, PlotlyChart, DataTable, NextStep
        →
Step 10: CROSS-ANALYZE (unchanged)
CrossAnalysis, DriverAnalysis
        →
Step 11: REPORT
ReportSchema compiled from FindingsStore + ChartStore + AnalysisLog refs
ReportRenderer executes schema → PDF | PPTX | Presentation | DOCX
        →
Step 12: PERSIST
IndexedDB auto-save | .groundedly export
```

---

## Updated Architectural Rules

### 1. Data flows DOWN, never UP (unchanged)
Grid → Parser → Fingerprint → Detect → Store → Flow → Engine → Display → Report.

### 2. Stats Engine is a black box, in a Worker (updated)
Pure functions, no DOM, no React. Runs in Web Worker → physically isolated. `resolveColumn()` is the only entry point. Accepts optional `weights[]` parameter on all aggregation functions.

### 3. One registry, not one parser (replaces rule 3)
All data enters through `ParserRegistry`. Each adapter is isolated. Adding a format means writing an adapter → never modifying an existing one.

### 4. Raw values are immutable (new)
`ColumnDefinition.rawValues` is written once at parse time and never written to again. All analysis receives `resolveColumn()` output. This is enforced by convention and by the Web Worker boundary → the Worker receives resolved values, not store references.

### 5. Charts are data + config (unchanged)

### 6. Findings have a typed API (replaces rule 5)
`FindingsStore.add()` is the only way to create a finding. `pushFinding()` is deleted. No component holds a reference to `findings[]` directly → all reads go through `FindingsStore` selectors.

### 7. Steps are plugins (replaces rule 6)
Each analysis is a self-describing `AnalysisPlugin`. The `AnalysisRegistry` knows all plugins. `CapabilityMatcher` knows none of them by name. A developer who opens `CapabilityMatcher.ts` to add a new analysis type has made an architectural error.

### 8. Export and presentation are renderers (replaces rule 7)
PDF, PPTX, clipboard, presentation mode → all are renderers of `ReportSchema`. No renderer contains business logic. `ReportSchema` contains no renderer-specific properties.

### 9. The log is permanent (new)
`AnalysisLog` entries are never modified after write. Every entry carries `userId`, `dataFingerprint`, and `dataVersion`. These three fields cannot be added retroactively — they must be present from the first entry written in production.

### 10. Stores are serializable (new)
No Zustand store contains DOM nodes, function values, or circular references at any point. Serialization to JSON must succeed at any moment without special handling. This is the prerequisite for IndexedDB persistence, session file export, and eventual Supabase sync.

---

## Files deleted in the updated architecture

| File | Replaced by | Reason |
|---|---|---|
| `universalParser.ts` | `ParserRegistry` + adapters | Monolith; formats interact dangerously |
| `FlowDetermination.ts` | `CapabilityMatcher` | Hardcoded conditions don't scale |
| `STEP_REGISTRY` | `AnalysisRegistry` auto-discovery | Named list requires modification to extend |
| `FLOW_REGISTRY` | Plugin `requires` declarations | Same reason |
| `plainLanguage.ts` (shared) | `plugin.plainLanguage()` per plugin | Interpretation belongs with the analysis |
| `StepRunner.ts` | `InteractiveRunner` + `HeadlessRunner` | One class cannot serve two execution models |

---

## What is NOT changed

The following are preserved exactly from the original architecture:

- Block 3 Stats Engine function signatures (except `weights?` addition)
- Block 4 Chart & Visualization Layer → all chart types, `ChartContainer`, `PlotlyChart`, edit flow
- Block 5 Output Display Layer → `StepCard`, all table components, `PlainLanguageCard`, `MetricsRow`
- The 1,400+ Stats Engine tests → all pass without modification
- Plotly configuration and theming
- Export formats (PDF, PPTX, DOCX, clipboard)
- The "data flows down, never up" principle
