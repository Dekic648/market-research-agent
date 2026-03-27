# CLAUDE.md — v5
## Market Research Stats Toolkit — Multi-Dataset + Production Phase

> **Swap this in when:** All 11 plugins work, preparation layer complete, report generation complete (PDF + PPTX exporting), session persistence working (IndexedDB + .mrst), SelectionStore and AnalysisButtonPanel implemented.
> This is the platform phase — everything before this was building the engine. Now you extend it.

---

## What exists at this point

The full single-dataset analysis pipeline is complete and working:

- 11 analysis plugins, all tested
- Data preparation layer (MissingDataPanel, RecodePanel, ComputePanel)
- DetectionLayer (statistical + semantic)
- TransformationStack + resolveColumn()
- ReportSchema + all renderers (PDF, PPTX, DOCX, Presentation)
- Session persistence (IndexedDB + .mrst)
- SelectionStore + AnalysisButtonPanel
- Both runners (InteractiveRunner + HeadlessRunner)

All 7 non-negotiable rules from v1 still apply in full.

---

## Current priority — four tracks

1. **DatasetGraph multi-node** — wave comparison, benchmarks, multi-brand
2. **Supabase** — auth, session sync, collaboration groundwork
3. **Advanced statistical methods** — from the methods priority list
4. **Parser adapters** — Qualtrics, SPSS, SurveyMonkey

Build in this order. Multi-dataset first — it's the most architecturally significant. Supabase second — it unblocks collaboration. Methods third — ongoing, never fully done. Adapters fourth — each one needs sample data to test against before building.

---

## Track 1 — DatasetGraph multi-node flows

Single-dataset analysis worked against one `DatasetNode`. Multi-node flows involve two or more nodes connected by edges.

### Activating multi-node

```typescript
// src/engine/CapabilityMatcher.ts — add multi-node resolution
CapabilityMatcher.resolveGraph(graph: DatasetGraph): MultiNodeCapabilitySet
// Walks graph edges, identifies compatible node pairs
// Returns available cross-dataset analyses
```

### Edge types and what they enable

```typescript
'same_survey'         // same questionnaire, different samples — comparison
'wave_comparison'     // same questionnaire, sequential time points — tracking
'external_reference'  // benchmark data — overlay, index against
'benchmark'          // readonly platform data — compare without exposing
```

### Cross-dataset plugins to build

```
WaveComparisonPlugin    id: 'wave_comparison'
  requires: DatasetEdge.relationship === 'wave_comparison'
  produces: { wave1: StepResult, wave2: StepResult, delta: DeltaResult }
  charts: ['groupedBar' with wave labels, 'scatterPlot' for correlation wave1 vs wave2]
  key output: which items changed significantly between waves (McNemar for binary, paired t-test for continuous)

BenchmarkOverlayPlugin  id: 'benchmark_overlay'
  requires: DatasetEdge.relationship === 'benchmark' | 'external_reference'
  produces: { primary: StepResult, benchmark: BenchmarkResult, indexValues: number[] }
  charts: ['horizontalBar' with benchmark line]
  rule: readonly node data never sent to Claude API — check node.readonly before any external call

MultiSamplePlugin       id: 'multi_sample'
  requires: DatasetEdge.relationship === 'same_survey', n >= 2 nodes
  produces: multi-group comparison with ANOVA/KW across all samples
```

### Alignment validation

Before any cross-dataset flow runs, validate the edge:

```typescript
// If edge has alignmentKey — validate respondent ID overlap
// If no alignmentKey — validate row counts match
// If neither valid — edge.alignmentValid = false, cross-dataset flows blocked with reason shown
```

---

## Track 2 — Supabase integration

### What Supabase replaces / extends

- **Replaces:** anonymous session in IndexedDB with authenticated user session in Postgres
- **Extends:** .mrst file export with cloud sync
- **Enables:** collaboration (two users, one session), session sharing via link

### Setup

```bash
npm install @supabase/supabase-js
```

### Schema — two tables only

```sql
-- users handled by Supabase Auth

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  session_json jsonb not null,    -- all store state except rawValues
  schema_version int default 1
);

create table column_data (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions not null,
  column_id text not null,
  raw_values jsonb not null        -- rawValues[] stored separately — can be large
);

-- Row-level security — users read own sessions only
alter table sessions enable row level security;
create policy "users own sessions" on sessions
  using (auth.uid() = user_id);
```

### Sync strategy — IndexedDB as cache, Supabase as source of truth

```typescript
// On save: write to IndexedDB immediately, sync to Supabase async
// On load: check Supabase first, fall back to IndexedDB if offline
// Conflict resolution: last-write-wins on updated_at timestamp

// src/stores/syncManager.ts
const SyncManager = {
  async save(session: SerializedSession): Promise<void>,
  async load(sessionId?: string): Promise<SerializedSession | null>,
  async list(): Promise<SessionMeta[]>,  // user's saved sessions
  isOnline(): boolean
}
```

### Collaboration groundwork

```typescript
// userId field on AnalysisLogEntry is already in place — this is the payoff
// createdBy on TransformationStack transforms is already in place

// Realtime subscription — add when collaboration feature is formally scoped:
const channel = supabase.channel(`session:${sessionId}`)
channel.on('postgres_changes', { event: 'UPDATE', table: 'sessions' }, (payload) => {
  // Merge remote changes into local stores
  // Conflict resolution strategy: TBD when feature is scoped
})
```

---

## Track 3 — Advanced statistical methods

Build from the priority list in `v2/docs/handoff/spss_gaps.html`. Each method becomes an `AnalysisPlugin` that registers with `AnalysisRegistry`. The infrastructure already supports them — just write the plugin.

### Immediate priority plugins

```
OrdinalRegressionPlugin     id: 'ordinal_regression'
  requires: ['ordinal', 'n>30']
  maps to: stats-engine ordinalRegression() — add if not present
  preconditions: [parallelLinesTest]

MediationPlugin             id: 'mediation'
  requires: ['continuous', 'n>50']
  maps to: stats-engine mediation() — add if not present
  produces: { directEffect, indirectEffect, totalEffect, bootstrapCI }

ModerationPlugin            id: 'moderation'
  requires: ['continuous', 'n>50']
  maps to: stats-engine moderation() — add if not present
  produces: { interactionEffect, simpleSlopes, jnRegions }

RepeatedMeasuresANOVAPlugin id: 'rm_anova'
  requires: ['repeated', 'n>20']
  maps to: stats-engine repeatedMeasuresANOVA() — add if not present
  preconditions: [mauchlysSphericity]
  produces: { F, p, partialEtaSq, sphericityCorrection }

VanWestendorpPlugin         id: 'van_westendorp'
  requires: ['ordinal']  // four price questions
  maps to: stats-engine vanWestendorp() — add if not present
  produces: { pmc, pmep, rp, opp, acceptableRange }

PowerAnalysisPlugin         id: 'power_analysis'
  // meta-plugin — no data required, user inputs effect size + alpha + power
  produces: { requiredN, achievedPower }
  note: one power function per test type (ttest, anova, correlation, chisq)
```

### Adding functions to stats-engine.ts

When a plugin requires a function not yet in the engine:

1. Add the function to `src/engine/stats-engine.ts`
2. Add its typed return interface to `src/engine/types.ts`
3. Add `weights?` parameter if it's an aggregation function
4. Add at least 3 test cases to `tests/engine/`
5. Run `npx vitest run` — all 85+ existing tests must still pass

---

## Track 4 — Parser adapters

Each adapter requires sample data files to test against before building. Do not build an adapter without sample data.

### When sample data is available:

```typescript
// src/parsers/adapters/QualtricsAdapter.ts
export const QualtricsAdapter = {
  canHandle(raw: string): boolean,  // detects double-header Qualtrics export format
  parse(raw: string): PastedData    // merges header rows, classifies columns
}
ParserRegistry.register(QualtricsAdapter)

// src/parsers/adapters/SPSSAdapter.ts
// src/parsers/adapters/SurveyMonkeyAdapter.ts
```

**Rule:** each adapter outputs the same normalized `PastedData`. The rest of the system never knows which adapter was used.

---

## Ongoing maintenance rules

### When a new analysis is requested

1. Check `v2/docs/handoff/spss_gaps.html` for severity and priority
2. Check if `stats-engine.ts` already has the function — it has 59
3. If not, add the function, add types, add tests, verify no regressions
4. Write the plugin, write its tests, register it
5. The flow engine discovers it automatically — no other files to edit

### When a client requests a new data format

1. Get sample data files first
2. Write an adapter in `src/parsers/adapters/`
3. Register it in `ParserRegistry`
4. Test against sample data
5. Never modify existing adapters

### When a finding needs to be added to a report

1. `FindingsStore.add()` — the only entry point
2. `FindingsStore.applyFDRCorrection('bh')` before report compilation if > 5 significance tests ran
3. `ReportSchema` references finding by ID — never embeds finding data directly

---

## CLAUDE_methods.md

A permanent reference file lives alongside this one at `v2/docs/handoff/CLAUDE_methods.md`. It contains every planned statistical method as a plugin stub — engine function, required capabilities, preconditions, and priority. Consult it whenever building a new plugin or adding to the engine.

---

## What still not to implement

- CFA (Confirmatory Factor Analysis) — requires SEM framework, separate architectural decision, not a simple plugin
- Conjoint analysis — heavy computation, separate decision
- On-premise / self-hosted Supabase — only if a specific client requires it
