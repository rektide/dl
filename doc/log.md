# Reporting Subsystem Redesign

## Status

Draft

## Problem

Two disconnected reporting systems that do not compose.

`--candidates` and `--verified` mode use `ext.log.info("stage", "event", data)` — fire-and-forget, no memory. The action path uses `LifecycleReporter` — structured accumulator that can summarize. Neither knows about the other. When `--candidates --archlist` lands as a unified pipeline, there will be no single place that collects both "flow expanded this input" and "archive handler ran for this repo" into one report.

## Terminology

- **Accumulator** — collects every record, can produce a summary at the end. Current: `LifecycleReporter`. Target: `Reporter`.
- **Fire-and-forget** — emits a record and discards it. No memory. Current: `ext.log.info()`. Target: `ReportLog.emit()`.
- **Sink** — where formatted output goes. Current: `process.stderr.write` inside `logPlugin`. Target: `ReportOutput` interface, pluggable.

## Current State

### LifecycleReporter ([`src/action/lifecycle.ts`](/src/action/lifecycle.ts))

Structured record accumulator scoped to one resolved repo. Created inside `runPipeline`, passed to each `ActionHandler.run()`.

Record shape:

```ts
type LifecycleRecord = {
  step: "archlist" | "archive" | "archive-jj" | "symlink-org" | "symlink-repo" | "wiki-dexport" | "wiki-git" | "flow" | "pipeline"
  source: string
  status: "ok" | "skipped" | "failed"
  transition: string
  details: Record<string, unknown>
}
```

- 27 call sites across 5 handlers and `runPipeline`
- Closed `LifecycleStep` union — adding a new domain requires editing this type
- No `info`-level status — every record implies a terminal outcome
- No timestamps
- Bound to `RepoContext` via factory: `createLifecycleReporter(resolved)`
- Summary only emitted if `--report-lifecycle` flag is true

### logPlugin ([`src/plugin/log.ts`](/src/plugin/log.ts))

Fire-and-forget event emitter. Owns `--json`, `--output`, `--output-stdout`, `--output-stderr` flags.

Event shape:

```ts
type LogEvent = {
  level: "debug" | "info" | "warn" | "error"
  stage: "candidates" | "dry-run" | "verified" | "verify" | "enrich" | "sync" | "link"
  event: string
  data: Record<string, unknown>
  timestamp?: string
}
```

- 33 call sites across command code, handlers, sync functions, input sources
- `LogStage` declares `"verify"` and `"enrich"` — never used at any call site
- `"sync"` stage is dominant (28 of 33 sites) — too coarse to be useful
- Timestamp is optional and only applied during formatting, not at emission time
- Owns stdio control (`--output*`) which is unrelated to logging

### Disconnected Observability

These surfaces produce structured data that must be manually bridged:

- **`FlowSessionSnapshot`** — session phase, counters, reinjections. Consumed in `processCandidates`, `processVerified`, and `runLegacyActionsFromFlow`.
- **`FlowReinjection`** records — redirect handoff tracking. Bridged into lifecycle via `flowLifecycleRecords()` in [`src/legacy/run.ts`](/src/legacy/run.ts), which synthesizes `LifecycleRecord[]` from reinjection data.
- **`processCandidates`/`processVerified`** — build ad-hoc log payloads in observers instead of using the lifecycle system.
- **Domain report types** — `DexportSyncReport`, `ArchiveSyncReport`, `GitWikiSyncReport`, `SimplifySyncReport`. Each handler manually converts its domain report into `lifecycle.ok/skipped/failed` calls.

### Outside the System

Standalone commands that bypass both systems:

- [`src/command/ln.ts`](/src/command/ln.ts) — uses a `SimplifyLog` adapter that wraps `console.log/warn`
- [`src/command/combine.ts`](/src/command/combine.ts) — direct `console.log/error`
- [`src/command/install-commands.ts`](/src/command/install-commands.ts) — direct `console.log/error/warn`
- [`src/command/interpolate.ts`](/src/command/interpolate.ts) — direct `console.error`
- [`src/command/project-files.ts`](/src/command/project-files.ts) — direct `console.log`
- [`src/command/dl.ts`](/src/command/dl.ts) — `console.error` for usage and fatal errors

These are not part of the dl pipeline and can stay as direct console output. Optional: accept a `ReportLog` interface for consistency.

## Target

### Directory Layout

```text
src/report/
  types.ts        # ReportRecord, ReportStatus, Reporter, ReportLog, ReportOutput
  reporter.ts     # createReporter(), createNoopReporter()
  format.ts       # formatRecordText(), formatRecordJson()
  plugin.ts       # gunshi plugin: wires reporters to output, owns flags
  plugin.test.ts
```

### Core Types ([`src/report/types.ts`](/src/report/types.ts))

```ts
export const REPORT_STATUS = {
  ok: "ok",
  skipped: "skipped",
  failed: "failed",
  info: "info",
} as const

export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS]

export type ReportRecord = Readonly<{
  step: string
  source: string
  status: ReportStatus
  transition: string
  details: Readonly<Record<string, unknown>>
  timestamp: string
}>

export type ReportSummary = Readonly<{
  subject: string | null
  hadError: boolean
  records: ReadonlyArray<ReportRecord>
}>

export interface Reporter {
  ok(input: Omit<ReportRecord, "status" | "timestamp">): void
  skipped(input: Omit<ReportRecord, "status" | "timestamp">): void
  failed(input: Omit<ReportRecord, "status" | "timestamp">): void
  info(input: Omit<ReportRecord, "status" | "timestamp">): void
  records(): ReadonlyArray<ReportRecord>
  summary(hadError: boolean): ReportSummary
}

export interface ReportLog {
  emit(record: Omit<ReportRecord, "timestamp">): void
}

export interface ReportOutput {
  write(record: ReportRecord): void
}
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `step` is `string` | No closed union. Domain modules define their own step constants. Adding a new handler or flow stage should not require editing a shared type. |
| `info` status | Replaces `ext.log.info()` calls that are not lifecycle outcomes (flow checkpoints, watch events, input events). Without this, every record implies success/failure. |
| Timestamps on every record | Current system only timestamps during formatting. Timestamps at emission time enable timing analysis and correlation. |
| `Reporter` is per-subject accumulator | Same role as current `LifecycleReporter` but not bound to `RepoContext`. Created by `forSubject()` on the plugin extension. |
| `ReportLog` is fire-and-forget | Replaces `ext.log.info/warn/error`. Thin emit interface. For events that don't need summarizing (watch, clipboard, input). |
| `ReportOutput` is pluggable sink | Production: `process.stderr.write` with formatting. Tests: in-memory array. Decouples emission from output. |
| Plugin absorbs logPlugin entirely | `--json`, `--output*`, `--report-lifecycle` all move to the report plugin. `logPlugin` is deleted. Formatting moves to `format.ts`. |

### Reporter Factory ([`src/report/reporter.ts`](/src/report/reporter.ts))

```ts
export function createReporter(
  subject: string | null,
  output?: ReportOutput,
  initial?: ReadonlyArray<ReportRecord>,
): Reporter

export function createNoopReporter(): Reporter
```

- `createReporter` accumulates records and optionally emits each one through `output` at call time.
- `createNoopReporter` for code paths that need the interface but shouldn't record (e.g., `ln` command).

### Formatting ([`src/report/format.ts`](/src/report/format.ts))

```ts
export function formatRecordText(record: ReportRecord): string
export function formatRecordJson(record: ReportRecord): string
```

Absorbed from current `logPlugin`. Pure functions, no side effects.

### Plugin ([`src/report/plugin.ts`](/src/report/plugin.ts))

```ts
export const REPORT_PLUGIN_ID = "rekon:report" as const

export interface ReportExtension {
  forSubject(subject: string): Reporter
  emit(record: Omit<ReportRecord, "timestamp">): void
}
```

The plugin:
- owns `--report-lifecycle`, `--json`, `--output`, `--output-stdout`, `--output-stderr` flags
- creates `ReportOutput` sink from flag values
- `forSubject()` returns a `Reporter` that accumulates and optionally emits through the sink
- `emit()` fires a single record through the sink without accumulation
- when `--report-lifecycle` is true, `forSubject()` reporters emit their summary after the pipeline completes

### How Consumers Change

**Action handlers** — receive `Reporter` from `report/types.ts` instead of `LifecycleReporter` from `action/lifecycle.ts`:

```ts
// before
import type { LifecycleReporter } from "../action/lifecycle.ts"

// after
import type { Reporter } from "../report/types.ts"
```

**`runPipeline`** — gets reporter from the extension:

```ts
// before
const lifecycle = createLifecycleReporter(resolved, initialRecords)

// after
const report = ctx.plugins[REPORT_PLUGIN_ID].forSubject(resolved.url?.toString() ?? resolved.input)
```

**Flow observers** — use `Reporter` instead of raw `ext.log.info()`:

```ts
// before
ext.log.info("candidates", "expanded", { input, url, org, project, provider })

// after
reporter.info({
  step: "flow",
  source: "proposed",
  transition: "candidate",
  details: { input, url, org, project, provider },
})
```

**Fire-and-forget events** (watch, clipboard, input) — use `emit()`:

```ts
// before
ext.log.info("sync", "watch_entry", { input: line })

// after
report.emit({
  step: "input",
  source: "watch",
  transition: "entry",
  details: { input: line },
})
```

**`SimplifyLog`** in [`src/symlink/ensure.ts`](/src/symlink/ensure.ts) — replaced by `ReportLog`:

```ts
// before
export interface SimplifyLog {
  info: (stage: string, event: string, data?: Record<string, unknown>) => void
  warn: (stage: string, event: string, data?: Record<string, unknown>) => void
}

// after — accepts ReportLog directly
```

## Migration Stages

### Stage 1: Create subsystem (backwards compatible)

Create `src/report/types.ts`, `reporter.ts`, `format.ts`. No plugin yet. `action/lifecycle.ts` re-exports from `report/types.ts` for backwards compatibility. All existing code keeps working unchanged.

Acceptance:
- existing tests pass without modification
- `action/lifecycle.ts` types are aliases to `report/types.ts`

### Stage 2: Migrate handlers

`ActionHandler.run()` receives `Reporter` from `report/types.ts`. Update all 5 handlers and `runPipeline`. Update `action/lifecycle.test.ts` → `report/reporter.test.ts`. Delete `action/lifecycle.ts`.

Acceptance:
- all handler tests pass
- `--report-lifecycle` output is structurally identical

### Stage 3: Absorb logPlugin

Create `report/plugin.ts`. Move `--json`, `--output*`, `--report-lifecycle` flags from `logPlugin` to report plugin. `ReportExtension` replaces `LogExtension`. Migrate all 33 `ext.log`/`ctx.log` call sites to `Reporter`/`ReportLog`. Delete `plugin/log.ts`.

Acceptance:
- `--json`, `--output*` flags work identically
- all 33 log call sites emit `ReportRecord`
- `plugin/log.ts` removed

### Stage 4: Migrate flow reporting

Flow observer stages use reporters. `processCandidates`/`processVerified` use reporters. `flowLifecycleRecords()` bridge in `legacy/run.ts` eliminated — flow stages write to the same reporter as action stages. `FlowSessionSnapshot` keeps its counters for runtime introspection but `reinjections` data is also available through the reporter.

Acceptance:
- `--candidates`, `--verified`, and action runs all use the same `Reporter` surface
- `flowLifecycleRecords()` removed
- unified lifecycle summary available when `--report-lifecycle` is true

### Stage 5: Clean up SimplifyLog and standalone commands

`ensureSymlink` accepts `ReportLog` instead of `SimplifyLog | LogExtension`. `ln.ts` uses `createNoopReporter()` or a console adapter. Optional — standalone commands can stay with direct console output.

Acceptance:
- `SimplifyLog` interface removed
- `ln` command still works

## What Gets Removed

| File/Type | Replaced By |
|-----------|-------------|
| `action/lifecycle.ts` (entire file) | `report/types.ts` + `report/reporter.ts` |
| `plugin/log.ts` (entire file) | `report/plugin.ts` + `report/format.ts` |
| `LogEvent` type | `ReportRecord` |
| `LogStage` type | `step: string` on `ReportRecord` |
| `LogExtension` interface | `ReportExtension` + `Reporter` + `ReportLog` |
| `LifecycleRecord` type | `ReportRecord` |
| `LifecycleReporter` type | `Reporter` |
| `LifecycleSummary` type | `ReportSummary` |
| `SimplifyLog` interface | `ReportLog` |
| `DlOptions.reportLifecycle` field | Plugin-owned flag |
| `flowLifecycleRecords()` in `legacy/run.ts` | Direct reporter usage |

## What Stays Unchanged

| What | Why |
|------|-----|
| `DexportSyncReport`, `ArchiveSyncReport`, `GitWikiSyncReport`, `SimplifySyncReport` | Domain result types that feed into reporters, not reporting types |
| `FlowSessionSnapshot` and session phase machine | Runtime introspection, orthogonal to record emission |
| Direct `console.*` in standalone commands (`ln`, `combine`, `install-commands`, `interpolate`, `project-files`) | Not part of the dl pipeline, no plugin system |
| `FlowReinjection` type | Still tracked by session for observability; also written to reporter in stage 4 |

## Related

- [`/doc/flow.md`](/doc/flow.md)
- [`/doc/stream-core.md`](/doc/stream-core.md)
- [`/doc/flow-runtime-stage-plan.md`](/doc/flow-runtime-stage-plan.md) — Step 5 (compose actions and views in one run)
