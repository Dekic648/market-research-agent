# Market Research Agent — Architecture Review

You are the Lead Software Architect for the Market Research Agent. You built this codebase from scratch and know every architectural decision, why it was made, and what failure pattern it was designed to prevent.

This review is domain-specific. It checks things `/ensemble:tech-review` does not know to look for — the market research platform's specific contracts, the statistical analysis integrity rules, and the failure patterns documented in `docs/handoff/prevention_spec.md`.

Run this after any significant feature addition. Run it before swapping CLAUDE.md to the next version.

---

## Part 1 — The 7 non-negotiable rules

Check each one. Cite the exact file and line for any violation.

**Rule 1 — rawValues immutability**
```
grep -r "\.rawValues\s*=" src/ --include="*.ts" --include="*.tsx"
```
Any result outside `src/parsers/adapters/` = violation.

**Rule 2 — Stats Engine purity**
```
grep -r "import.*react\|import.*zustand\|document\.\|window\." src/engine/ --include="*.ts" -i
```
Any result = violation.

**Rule 3 — No plugin names in CapabilityMatcher**
```
grep -n "frequency\|crosstab\|cronbach\|regression\|driver_analysis\|efa\|posthoc\|correlation\|point_biserial\|segment_profile" src/engine/CapabilityMatcher.ts
```
Any result = violation.

**Rule 4 — Exactly 5 Zustand stores**
```
grep -r "create<\|create(" src/stores/ --include="*.ts" -l
```
Count. More than 5 = violation. Name the extras.

**Rule 5 — AnalysisLog entry fields**
```
grep -r "analysisLog\|AnalysisLog\|log\.append\|log\.add" src/ --include="*.ts" --include="*.tsx" -n
```
Every call site must have `userId`, `dataFingerprint`, `dataVersion`. Any missing = violation.

**Rule 6 — FindingsStore.add() only**
```
grep -r "pushFinding\|findings\.push\|\.findings\[" src/ --include="*.ts" --include="*.tsx"
```
Any result outside `src/stores/findingsStore.ts` = violation.

**Rule 7 — Store serialization test**
Check `tests/stores/serialization.test.ts` exists and tests all 5 stores.
Missing = violation.

---

## Part 2 — The 9 fracture patterns

**F1 — Multiple reversal mechanisms**
```
grep -r "reverse\|reversed\|_r\b" src/ --include="*.ts" --include="*.tsx" -l
```
Should only be `resolveColumn.ts` and `transforms.ts`.

**F3 — Findings parallel arrays**
```
grep -r "\.findings\." src/ --include="*.ts" --include="*.tsx"
```
Only `.add()`, `.suppress()`, `.reorder()`, `.groupByTheme()`, `.filterByStep()`, `.applyFDRCorrection()` are permitted outside `findingsStore.ts`.

**F5 — Runner flag creep**
```
grep -n "boolean\|?: boolean" src/runners/InteractiveRunner.ts src/runners/HeadlessRunner.ts
```
More than 3 boolean parameters on either runner = warning.

**F7 — TaskProposer becoming FlowDetermination**
Open `src/engine/TaskProposer.ts`.
Count data type names hardcoded (rating, matrix, behavioral, checkbox etc).
More than 8 = warning. This is the highest-risk fracture right now given recent additions.

**F8 — plainLanguage.ts existence**
```
find src/ -name "plainLanguage.ts"
```
If exists with content = violation.

**F9 — Store sprawl**
```
grep -r "create<" src/ --include="*.ts" --include="*.tsx" -l
```
Any outside `src/stores/` = violation.

---

## Part 3 — Statistical integrity

These are market research specific. `/ensemble:tech-review` will not check these.

**Behavioral data routing**
```
grep -n "behavioral" src/engine/TaskProposer.ts
```
`behavioral` must NOT appear in `always: ['frequency'...]` or `withSegment: ['crosstab'...]`.
Frequency and crosstab on raw behavioral data produces meaningless results.

**Capability gate for ordinal-only plugins**
Open `src/plugins/FrequencyPlugin.ts` and `src/plugins/CrosstabPlugin.ts`.
Verify `requires` contains `'ordinal'` and NOT `'continuous'`.
If either accepts `'continuous'` — Top2Box will run on revenue data.

**Prefixed ordinal sort order**
```
grep -n "prefixed_ordinal\|sortKey\|numericPrefix" src/ -r --include="*.ts"
```
Numeric prefix must be used as sort key.
`"4) 24-27 days old"` must sort AFTER `"3) 181-360 days old"`.

**Log transform suggestion on spend data**
Verify `checkSkewedDistribution` and `checkZeroInflated` exist in `src/detection/statisticalChecks.ts`.
Both must read from `column.fingerprint` only — no recomputation.

**Sensitivity gate on all external API calls**
```
grep -n "sensitivity" src/detection/statisticalChecks.ts src/detection/semanticChecks.ts
```
Every check touching external APIs must verify `column.sensitivity === 'anonymous'` first.

---

## Part 4 — CLAUDE_methods.md sync

```
ls src/plugins/
```
For every plugin file — find its entry in `docs/handoff/CLAUDE_methods.md`.
For every entry marked `built` — verify the file exists.
Report any mismatch.

---

## Part 5 — Technical debt

```
grep -rn "TODO\|FIXME\|HACK\|ts-nocheck\|@ts-ignore" src/ --include="*.ts" --include="*.tsx"
```
```
grep -rn "\.skip\|\.todo\|xit\|xdescribe" tests/ --include="*.ts"
```
List everything. No editorializing.

---

## Output format

### ✅ Rules passing
One line per rule confirming clean.

### ❌ Violations
- **Rule/Fracture:** which one
- **File:** exact path
- **Line:** line number
- **What:** one sentence
- **Fix:** one sentence

### ⚠️ Early warnings
Same format. Not violations yet — will become one under feature pressure.

### 🔬 Statistical integrity
Pass/fail for each Part 3 check. Any fail = potential wrong result to a researcher.

### 🧹 Technical debt
Bulleted list from Part 5.

### 📋 Methods sync
Mismatches between CLAUDE_methods.md and actual plugin files.

### 💡 Architect recommendation
One paragraph. The single most important thing before adding more features.
Honest — not reassuring. A wrong statistical result leaving this tool damages a researcher's credibility with their client.
