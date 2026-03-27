# CLAUDE.md — v4
## Market Research Stats Toolkit — Preparation Layer + Report Phase

> **Swap this in when:** All 11 plugins are implemented and producing correct results, both runners work, Phases 4–6 (DetectionLayer) are complete.
> Confirm: `FrequencyPlugin` through `SegmentProfilePlugin` all pass their own test suites. `InteractiveRunner` and `HeadlessRunner` both produce `StepResult` correctly.

---

## What exists at this point

```
v2/src/
├── engine/
│   ├── stats-engine.ts         — fully typed, weights? on all aggregation functions
│   ├── resolveColumn.ts        — in use by all plugins
│   ├── chartDefaults.ts        — baseConfig, darkLayout
├── parsers/
│   ├── ParserRegistry.ts
│   ├── fingerprint.ts          — ColumnFingerprint complete
│   ├── adapters/PasteGridAdapter.ts
├── detection/
│   ├── types.ts
│   ├── statisticalChecks.ts    — all 6 checks implemented
│   ├── semanticChecks.ts       — Claude API, cached per column
│   ├── detectionLayer.ts       — orchestrator, flags logged
├── plugins/
│   ├── AnalysisRegistry.ts
│   ├── FrequencyPlugin.ts      — and all 10 others
│   ├── [11 plugins total]
├── runners/
│   ├── IStepRunner.ts
│   ├── InteractiveRunner.ts
│   ├── HeadlessRunner.ts
├── engine/
│   ├── CapabilityMatcher.ts
├── stores/ [all 5 complete]
```

All 7 non-negotiable rules still apply in full.

---

## Current priority — three parallel tracks

1. **Data Preparation Layer** — the UI between paste and analysis
2. **Report generation** — ReportSchema + ReportRenderer
3. **Session persistence** — IndexedDB + .mrst file

Build in this order. Preparation first — it gates analysis correctness. Report second — it completes the researcher workflow. Persistence third — it's the last infrastructure piece before Supabase consideration.

---

## Track 1 — Data Preparation Layer

This is the mandatory step between column tagging and analysis. Three panels, one mandatory action.

### Component structure

```
src/components/DataPreparation/
├── PrepWorkspace.tsx         — three-panel layout, pipeline position indicator
├── MissingDataPanel.tsx      — MANDATORY — user cannot skip this
├── RecodePanel.tsx           — pre-populated from DetectionFlags
├── ComputePanel.tsx          — formula editor
├── PrepLog.tsx               — always-visible strip at bottom
```

### MissingDataPanel — the one mandatory step

```typescript
// User must declare strategy before "Run Analysis" button activates
type MissingDataStrategy = 'listwise' | 'pairwise' | 'mean_imputation'

// On declaration:
AnalysisLog.append({
  type: 'missing_strategy_declared',
  payload: {
    strategy,
    nMissing: totalMissingCount,
    variablesAbove20pct: columnIds,
    littlesMCARResult: { chiSq, df, p, interpretation }
  }
  // + userId, dataFingerprint, dataVersion as always
})
```

Little's MCAR test result must be shown before the user chooses. If `p < 0.05` (not MCAR), surface a warning that listwise deletion may introduce bias.

### RecodePanel — driven by DetectionLayer output

Pre-populate from `DatasetNode.detectionResult.flags` where `type === 'reverse_coding_candidate'`. The user confirms or dismisses each flag. Confirmed flags become `ReverseCodeTransform` entries in the column's `transformStack` via `datasetGraph.addTransform()`.

**Rule:** the panel never writes to `rawValues`. It only calls `addTransform()`.

### ComputePanel — formula builder

```typescript
// Supported functions in formula editor:
'MEAN'   | 'SUM'    | 'MIN'   | 'MAX'
'LOG'    | 'SQRT'   | 'ABS'   | 'ZSCORE'
'IF'     | 'ROUND'

// Columns suffixed _r in formulas reference the reversed version
// Formula stored as string in ComputeVariableTransform.formula
// Re-executed from source on every resolveColumn() call — never stores computed result
```

### PrepLog strip

Always visible at the bottom of the preparation workspace. Shows:
- Missing strategy declared / not declared
- Count of pending DetectionFlags
- Count of active transforms
- "Run Analysis →" button — disabled until missing strategy is declared

---

## Track 2 — Report Generation

### ReportSchema — serializable JSON, not a component tree

```typescript
// src/report/schema/ReportSchema.ts
interface ReportSchema {
  id: string
  version: number
  createdAt: number
  createdBy: string              // userId

  sourceDatasetIds: string[]     // DatasetGraph node IDs
  analysisLogSnapshot: string[]  // log entry IDs that produced findings

  // Re-runnable: schema can be applied to new data
  sections: ReportSection[]
}

type ReportSection =
  | { type: 'executive_summary'; findingRefs: string[] }
  | { type: 'finding'; findingId: string; theme?: string }
  | { type: 'chart'; chartId: string; caption?: string }
  | { type: 'narrative'; text: string }
  | { type: 'ai_narrative'; prompt: string; cachedResult: string | null; generatedAt: number | null }
  | { type: 'segment_profile'; segmentId: string }
  | { type: 'driver'; outcomeVariable: string }
  | { type: 'conditional'; showIf: string; section: ReportSection }
  // showIf examples: 'R2 > 0.3', 'alpha > 0.7', 'p < 0.05'
```

**Rule:** `ReportSchema` contains no renderer-specific properties — no slide counts, no font sizes, no animation order. If a property only makes sense for one output format, it belongs in that renderer, not the schema.

**Rule:** schema must be re-runnable against new data. Every `findingId` and `chartId` references a `AnalysisLog` entry. A schema applied to wave 2 data produces wave 2 results with the same structure.

### ReportRenderer — dumb executor

```typescript
// src/report/renderer/ReportRenderer.ts
interface ReportRenderer {
  render(schema: ReportSchema, stores: AllStores): RendererOutput
  // RendererOutput is format-specific
}

// Four renderers — all consume the same ReportSchema:
class PDFRenderer implements ReportRenderer      // src/report/renderer/PDFRenderer.ts
class PPTXRenderer implements ReportRenderer     // src/report/renderer/PPTXRenderer.ts
class DOCXRenderer implements ReportRenderer     // src/report/renderer/DOCXRenderer.ts
class PresentationRenderer implements ReportRenderer  // full-screen interactive
```

**Rule:** no renderer contains business logic. All conditional display (`showIf`) is evaluated by a shared `evaluateCondition(expr, stores)` function before the renderer receives the section. The renderer only executes, never decides.

### Report builder UI

```
src/components/Report/
├── ReportBuilder.tsx     — schema editor — not a renderer
├── FindingsList.tsx      — reads FindingsStore, drag to reorder
├── ChartSelector.tsx     — pick which charts to include
├── SectionEditor.tsx     — edit narrative text, add commentary
├── ExportPanel.tsx       — trigger PDF/PPTX/DOCX download
```

### FDR correction — run before report generation

```typescript
// Before compiling the report schema, always offer:
FindingsStore.applyFDRCorrection('bh')
// Benjamini-Hochberg is preferred for market research
// Bonferroni available as stricter option
// Logs to AnalysisLog: { type: 'fdr_correction_applied', method, nTests, adjustedPValues[] }
```

---

## Track 3 — Session Persistence

### IndexedDB via idb

```typescript
// src/stores/persistence.ts
import { openDB } from 'idb'

const db = await openDB('mrst', 1, {
  upgrade(db) {
    db.createObjectStore('sessions')
    db.createObjectStore('columnData')
    db.createObjectStore('analysisLog')
  }
})

// Auto-save — subscribe to datasetGraph store
useDatasetGraphStore.subscribe(
  debounce(async (state) => {
    await db.put('sessions', serializeStores(), 'current')
    // rawValues stored separately per column
    for (const node of state.nodes) {
      for (const group of node.parsedData.groups) {
        for (const col of group.columns) {
          await db.put('columnData', col.rawValues, col.id)
        }
      }
    }
  }, 2000)
)

// Auto-restore on app load
const saved = await db.get('sessions', 'current')
if (saved) rehydrateAllStores(saved)
```

### Session file export

```typescript
// src/stores/sessionFile.ts
// Export: .mrst file (market-research-stats-toolkit)
async function exportSession(): Promise<void> {
  const payload = JSON.stringify({
    schemaVersion: 1,
    exportedAt: Date.now(),
    stores: serializeAllStores()  // includes rawValues
  })
  const compressed = await compress(payload)
  downloadFile(compressed, `session_${dateString()}.mrst`)
}

// Import: read → validate schemaVersion → restore
async function importSession(file: File): Promise<void> {
  const text = await decompress(await file.arrayBuffer())
  const payload = JSON.parse(text)
  if (payload.schemaVersion !== 1) throw new Error('Incompatible session version')
  rehydrateAllStores(payload.stores)
}
```

---

## SelectionStore — build after core flow is stable

```typescript
// src/stores/selectionStore.ts
interface DataSelection {
  columns: ColumnDefinition[]
  rowFilter: FilterExpression | null
  cellRange: CellRange | null
  sourceDataset: DatasetNode
}

// RULE: SelectionStore never imports from SessionStore
// Cross-store reads via selectors.ts only
```

`AnalysisButtonPanel` is a reactive view of `CapabilityMatcher.resolve(currentSelection)`. Green = runnable, grey = blocked with reason from `plugin.preconditions`. Results surface inline below the grid. User pins to `FindingsStore` if wanted. Every run logged to `AnalysisLog`.

---

## What NOT to implement yet

- DatasetGraph multi-node flows (wave comparison, benchmarks) — single-node stable first
- Supabase — after IndexedDB confirmed in production
- CFA — requires SEM framework decision
- Qualtrics / SPSS adapters — need sample data files
