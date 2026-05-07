# Phase 3: Actions as Flow Stages

## Status

Draft

## Purpose

Convert action handlers from verified-observer side effects into first-class flow stages. Drop `RepoContext` entirely. Let gunshi plugins contribute action stages to the pipeline in a disaggregated manner.

## Where We Are (Post-Phase 2)

Phase 2 established one flow plan per command invocation. All command modes (`--candidates`, `--verified`, actions, subcommands) compose through [`runFlowCommand()`](/src/command/run.ts).

### What Works Well

- **One plan, one execute.** `dl` no longer branches into mutually exclusive modes. Candidates, verified output, and actions attach to the same flow plan.
- **Redirect handoff is provider-level.** Redirect providers call `runtime.push()` instead of yielding redirect repos. Dedupe and handoff tracking live in the flow session. No special reinjection stage.
- **Session lifecycle is explicit.** Phase state machine (`idle` -> `configured` -> `executing` -> `completed/failed`) with snapshot introspection works.
- **Fluent plan API.** `flow.plan().singleton().config(...).push(...).on(...).execute()` reads well.
- **Error collection is explicit.** Action tasks are collected into `actionTasks[]` and awaited after flow execution, not via mutable closure state.

### What Still Needs Work

- **`RepoContext` bridge.** [`toLegacyRepoContext()`](/src/command/run.ts:34) converts modern `Repo` into legacy `RepoContext` every time an action runs. This is the primary target for removal.
- **Actions are observers, not stages.** Action execution happens inside `plan.on("verified", ...)` callbacks, not as pipeline stages. This means actions cannot participate in flow context, error handling is bolted on, and lifecycle reporting is bridged manually.
- **`DlContext` carries action dependencies.** Roots, git ops, dexport ops, and log are passed through `DlContext`. These should come from plugins.
- **Logging is dual-tracked.** `ext.log.info()` (fire-and-forget) and `LifecycleReporter` (accumulator) are separate systems. See [`doc/log.md`](/doc/log.md) for the reporting redesign plan.
- **`runPipeline()` is a sequential handler loop.** [`src/action/pipeline.ts`](/src/action/pipeline.ts) iterates handlers in order with try/catch. It is not a flow stage and does not compose with the stream pipeline.

## What Phase 3 Must Achieve

```text
Before (phase 2):
  input -> candidates -> verify -> [observer: toLegacyRepoContext -> runPipeline]

After (phase 3):
  input -> candidates -> verify -> archive stage -> wiki stage -> archlist stage -> symlink stage -> report stage
```

Each action is a `Stage<Repo, FlowContext>`. No `RepoContext`. No `runPipeline`. No observer bridge.

## Core Design Decisions

### 1. Action Handlers Become Stages

Current [`ActionHandler`](/src/action/handler.ts):
```ts
interface ActionHandler {
  readonly id: string
  readonly run: (resolved: RepoContext, ctx: DlContext, lifecycle: LifecycleReporter) => Promise<ActionResult>
}
```

Target: action stage adapters that wrap domain logic as `Stage<Repo, FlowContext>`:
```ts
function createActionStage(handler: ActionStageDefinition): Stage<Repo, FlowContext>
```

Action stage definitions receive `Repo` directly, not `RepoContext`. They receive their dependencies from `FlowContext.plugins`, not from `DlContext`.

### 2. RepoContext Is Deleted

[`src/repo/context.ts`](/src/repo/context.ts) and its `DefaultRepoContext` class go away. The fields that `RepoContext` carries that `Repo` does not:

| RepoContext field | Where it goes instead |
|---|---|
| `wikiRepoUrl` | Computed inside wiki handler from `repo.url` |
| `wikiDeepUrl` | Computed inside deepwiki handler from `repo.url` |
| `source.provider` | `repo.producedBy` |
| `verified` | `repo.state === "verified"` |
| `input`, `org`, `project`, `host` | Already on `Repo` |

The `wikiRepoUrl` and `wikiDeepUrl` computations are currently done in `toLegacyRepoContext()` ([`src/command/run.ts:48`](/src/command/run.ts:48)). They move into their respective handlers.

### 3. DlContext Dependencies Come From Plugins

Current [`DlContext`](/src/action/types.ts) bundles roots, options, git ops, and dexport ops. In phase 3:

- **roots** — from a config plugin or resolved from options
- **options** — `DlOptions` stays, but action stages read their own state from it directly
- **gitOps** — from a git plugin extension
- **dexportOps** — from a dexport plugin extension
- **log** — from the report plugin (see [`doc/log.md`](/doc/log.md))

Action stages read their dependencies from `ctx.plugins[id]` like any other stage.

### 4. Gunshi Plugins Contribute Action Stages

Each action plugin already contributes `dl:actions` (specs) and `dl:handlers` (handler instances). In phase 3, plugins contribute **stages** instead of handlers:

```ts
// before: handler-based
interface DlActionProviderExtension {
  readonly "dl:actions": ReadonlyArray<DlActionSpec>
  readonly "dl:handlers": ReadonlyArray<ActionHandler>
}

// after: stage-based
interface DlActionProviderExtension {
  readonly "dl:actions": ReadonlyArray<DlActionSpec>
  readonly "dl:stages": (options: DlOptions) => ReadonlyArray<Stage<Repo, FlowContext>>
}
```

The stage factory receives `DlOptions` to decide which stages to include (based on action state). The flow runner assembles verified stages from all plugin contributions.

### 5. Lifecycle Reporting Becomes Native to Stages

Instead of `runPipeline()` creating a `LifecycleReporter` and passing it to each handler, each action stage records its own lifecycle events. The report plugin (from [`doc/log.md`](/doc/log.md)) provides a `Reporter` through `FlowContext.plugins`.

This eliminates:
- [`src/action/lifecycle.ts`](/src/action/lifecycle.ts) — replaced by `src/report/reporter.ts`
- [`flowLifecycleRecords()`](/src/command/run.ts:55) bridge in `run.ts`
- The manual conversion of domain reports into lifecycle records

## Implementation Plan

### Step 1: Define Action Stage Adapter

Create a thin adapter that converts current `ActionHandler.run()` semantics into `Stage<Repo, FlowContext>`.

File: `src/action/stage.ts`

This is the bridge during migration. It reads `Repo`, calls existing handler logic, and yields the repo onward. It does not require `RepoContext`.

### Step 2: Migrate One Handler End-to-End

Pick `archlist` as the simplest handler. Convert `archlistHandler` to an action stage that:
- receives `Repo` directly
- reads archlist state from `DlOptions` via `ctx.plugins`
- records lifecycle through the report plugin
- does not reference `RepoContext` or `DlContext`

This validates the stage adapter pattern before migrating the rest.

### Step 3: Convert `runFlowCommand` to Use Action Stages

Replace the `plan.on("verified", ...)` action observer with:

```ts
const actionStages = collectActionStagesFromPlugins(extensions, options)
// pass to flow plan as verifiedStages
```

Remove `toLegacyRepoContext()`, `flowLifecycleRecords()`, and the `actionTasks` collection from `runFlowCommand()`.

### Step 4: Migrate Remaining Handlers

Convert archive, wiki, deepwiki, symlink handlers one at a time. Each one:
- stops importing `RepoContext`
- receives `Repo` and reads dependencies from plugins
- records lifecycle through the report plugin

### Step 5: Delete Legacy Code

Remove:
- `src/repo/context.ts` and `DefaultRepoContext`
- `src/action/pipeline.ts` (`runPipeline`)
- `src/action/lifecycle.ts` (if report plugin is ready)
- `DlContext` interface from `src/action/types.ts`
- `toLegacyRepoContext()` and `flowLifecycleRecords()` from `src/command/run.ts`

### Step 6: Wire Report Plugin

If [`doc/log.md`](/doc/log.md) migration is ready, wire the report plugin so action stages use `Reporter` instead of the old `LifecycleReporter`. This can happen in parallel with steps 2-5.

## Things That Were Missed or Skipped in Earlier Phases

### Standing Lint Warnings

Several unused imports from the `repo/` directory were flagged during phase 1/2 but not cleaned up:

- `DefaultRepoContext` imported but unused in [`src/repo/base/redirect-repo.ts:1`](/src/repo/base/redirect-repo.ts:1) — this file will likely be deleted in phase 3
- `RepoContext` imported but unused in [`src/repo/provider/crates-io.ts:1`](/src/repo/provider/crates-io.ts:1) — will be cleaned when that provider drops RepoContext
- `simplify` imported but unused in [`src/symlink/ensure.ts:4`](/src/symlink/ensure.ts:4) — dead code from a previous refactor
- `LogExtension` imported but unused in [`src/dexport/sync.ts:2`](/src/dexport/sync.ts:2) and [`src/symlink/ensure.ts:3`](/src/symlink/ensure.ts:3) — these modules still accept `LogExtension` params but never use them
- `syncDexportWiki` imported but unused in [`src/deepwiki/handler.ts:7`](/src/deepwiki/handler.ts:7)
- `originalCallback` unused in [`src/command/input.ts:131`](/src/command/input.ts:131)

These should be cleaned up during phase 3 work as we touch each file.

### Terminology: Reinjection vs Handoff

Done. All `reinjection`/`reinjected` naming has been renamed to `handoff`/`handoffs`. `FlowReinjection` is now `FlowHandoff`, `reinjectedCount` is `handoffCount`, `reinjections` is `handoffs`. The lifecycle transition was renamed from `redirect-reinject` to `redirect-handoff`.

### `repo/` Directory Has Old Provider Implementations

[`src/repo/provider/`](/src/repo/provider/) contains older provider implementations (github, gitlab, crates-io, etc.) that use `RepoContext` and the `RedirectRepo` / `HostRepo` base classes. These are separate from the new providers in [`src/provider/`](/src/provider/). The `repo/` directory may need audit to determine what is still used vs what is dead code from before the flow system was built.

## Test Over-Building Observation

The test file [`src/command/run.test.ts`](/src/command/run.test.ts) grew from 131 lines (2 tests) to ~420 lines (6 tests) during phase 2. The in-memory extension helpers added significant boilerplate (mocking `FlowExtension`, `DlActionsExtension`, `BufferedAsyncQueue`, etc.).

This is useful for now but worth watching:

- The mock helpers are testing the wiring, not the domain logic. As actions become stages, the wiring tests may become redundant with stage-level tests.
- Prefer testing individual stages in isolation over testing the full `runFlowCommand()` orchestration with mocks.
- The existing `processRepoContext` tests in `run.test.ts` (lines 66-130) test `runPipeline()` with real (mocked I/O) handlers. This pattern is better than the in-memory extension mocks for actual correctness.

Phase 3 should aim for: each action stage gets its own focused test, and `runFlowCommand` gets a thin integration test that just verifies stage assembly.

## Remaining Work Beyond Phase 3

### Reporting Subsystem Redesign

[`doc/log.md`](/doc/log.md) describes a full migration from the dual `ext.log` / `LifecycleReporter` system to a unified `src/report/` module. This is a parallel track that can overlap with phase 3. The key stages:

1. Create `src/report/types.ts`, `reporter.ts`, `format.ts` (backwards compatible)
2. Migrate handlers to `Reporter` from `report/types.ts`
3. Absorb `logPlugin` into report plugin
4. Migrate flow reporting to use reporters
5. Clean up `SimplifyLog` and standalone commands

Phase 3 step 6 (wire report plugin) aligns with log.md stage 2. Full log migration can continue after phase 3.

### Signal-Backed Session Metadata

[`doc/stream-core.md`](/doc/stream-core.md) and [`doc/flow-runtime-stage-plan.md`](/doc/flow-runtime-stage-plan.md) describe integrating `signal-polyfill` + `signal-utils` for reactive session fields. This is deferred until the stream-based flow is stable. Not a phase 3 concern but on the horizon.

### `repo/` Directory Cleanup

The old provider system in `src/repo/` needs audit. Many files there may be dead code now that `src/provider/` is the active system.

## Prompt for Phase 3 Session

When starting phase 3 implementation, the following context should be provided:

---

You are continuing work on the rekon `dl` command. Phases 1 and 2 are done:

- **Phase 1** built the flow runtime: plugin-owned session state, buffered queue, producer-only verification, provider-level redirect handoff via `runtime.push()`.
- **Phase 2** unified command modes: one `runFlowCommand()` composes candidates, verified output, and actions onto one flow plan.

**Phase 3 goal:** Replace "actions as verified observers" with "actions as flow stages." **Delete `RepoContext`.** Make gunshi plugins contribute action stages to the pipeline in a disaggregated manner.

Key files to read first:
- [`src/command/run.ts`](/src/command/run.ts) — the current `runFlowCommand()` with its `toLegacyRepoContext()` bridge and action observer
- [`src/action/handler.ts`](/src/action/handler.ts) — current `ActionHandler` interface (takes `RepoContext`)
- [`src/action/pipeline.ts`](/src/action/pipeline.ts) — `runPipeline()` sequential handler loop to be eliminated
- [`src/flow/types.ts`](/src/flow/types.ts) — `Repo` type and `FlowContext`
- [`src/plugin/flow.ts`](/src/plugin/flow.ts) — flow plugin with `FlowPlan`, session state, enqueue logic
- [`src/plugin/dl-actions.ts`](/src/plugin/dl-actions.ts) — how plugins currently contribute action specs/handlers
- [`doc/log.md`](/doc/log.md) — reporting subsystem redesign (parallel track, not blocking)
- [`doc/phase3.md`](/doc/phase3.md) — this document

Constraints:
- Each action (archive, wiki, deepwiki, archlist, symlink) becomes a `Stage<Repo, FlowContext>`.
- `RepoContext` and `DefaultRepoContext` must be deleted by the end.
- `DlContext` goes away; dependencies come from plugins.
- `runPipeline()` is eliminated; stages compose in the flow.
- Do not over-build tests. Test individual stages, not orchestration wiring.
- Clean up standing lint warnings in files you touch.

---

## Related

- [`/doc/flow.md`](/doc/flow.md) — overall flow architecture
- [`/doc/stream-core.md`](/doc/stream-core.md) — stream core vs signal core decision
- [`/doc/flow-runtime-stage-plan.md`](/doc/flow-runtime-stage-plan.md) — runtime stage plan (some steps now outdated after phase 1/2)
- [`/doc/log.md`](/doc/log.md) — reporting subsystem redesign
