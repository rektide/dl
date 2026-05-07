# Phase 3 Steering: Drop RepoContext, Actions Become Stages

## What We Are Doing

Each action handler (archive, wiki, deepwiki, archlist, symlink) currently operates as an `ActionHandler` that receives `RepoContext` and `DlContext`. We are rewriting each one as a `Stage<Repo, FlowContext>` that receives `Repo` directly. When this is done, `RepoContext`, `DlContext`, `ActionHandler`, `runPipeline`, and the `toLegacyRepoContext` bridge are all deleted.

## Current State

### What exists and works (do not rework):
- `src/flow/types.ts` — `Repo`, `FlowContext`, `FlowPlugins`, checkpoints
- `src/execute/` — executor, stage type, buffered queue, fan-in
- `src/plugin/flow.ts` — flow plugin with session lifecycle, plan API, enqueue
- `src/provider/` — providers with `ProviderRuntime` push interface, redirect handoff
- `src/command/run.ts` — `runFlowCommand()` composes one plan per invocation
- `src/command/dl.ts` — uses `runFlowCommand()` with `hasExplicitAction()` detection

### What must be eliminated:
- `src/repo/context.ts` — `RepoContext` interface and `DefaultRepoContext` class
- `src/action/handler.ts` — `ActionHandler` interface
- `src/action/pipeline.ts` — `runPipeline()` sequential runner
- `src/action/lifecycle.ts` — `createLifecycleReporter()` takes `RepoContext`
- `src/action/types.ts` — `DlContext` (may evolve, not delete yet)
- `src/command/run.ts:toLegacyRepoContext()` — the Repo→RepoContext bridge
- `src/command/run.ts:flowLifecycleRecords()` — may be absorbed into stage lifecycle

### What must be rewritten as stages:
- `src/archive/handler.ts` → archive stage
- `src/wiki/handler.ts` → wiki stage
- `src/deepwiki/handler.ts` → deepwiki stage
- `src/archlist/handler.ts` → archlist stage
- `src/symlink/handler.ts` → symlink stage

### What stays but evolves:
- `src/action/state.ts` — step states (ENSURE, OFF, etc.) — still useful
- `src/action/registry.ts` — `DlActionSpec`, action resolution — still useful for CLI flags
- `src/action/types.ts` — `DlOptions` — stays until DlContext can be dissolved
- `src/plugin/dl-actions.ts` — action plugin — evolves to contribute stages instead of handlers
- Each `*/sync.ts` — the actual sync logic stays, just gets different argument shapes

## Architecture Target

### Before (current):
```
Repo → toLegacyRepoContext() → RepoContext → runPipeline(ActionHandler[]) → ActionResult
```

### After (target):
```
Repo → Stage<Repo, FlowContext>[] (action stages) → Repo (passed through)
```

Each action stage:
- Receives `AsyncIterable<Repo>` and `FlowContext`
- Reads action state from `FlowContext.plugins` (via the action plugin extension)
- Does its work for each repo
- Yields the repo onward (stages are pass-through, not terminal)
- Records lifecycle through the plugin system, not through a LifecycleReporter parameter

### Plugin contributes stages, not handlers:

Current `DlActionProviderExtension`:
```ts
interface DlActionProviderExtension {
  "dl:actions": ReadonlyArray<DlActionSpec>
  "dl:handlers": ReadonlyArray<ActionHandler>  // ← DELETE THIS
}
```

Target:
```ts
interface DlActionProviderExtension {
  "dl:actions": ReadonlyArray<DlActionSpec>
  "dl:stages": ReadonlyArray<Stage<Repo, FlowContext>>  // ← NEW
}
```

The flow runner assembles `dl:stages` into `verifiedStages` in the `ExecuteContext`.

## What Each Handler Currently Needs (to inform rewrite)

### archive handler
- `resolved.url` (RepoContext) → `repo.url` (Repo)
- `ctx.roots.archiveRoot` → from plugin/config
- `ctx.gitOps` → from plugin/config
- `ctx.options.archiveState` → from action plugin via `FlowContext.plugins`
- `ctx.log` → from plugin
- `lifecycle` reporter → stage records its own lifecycle

### wiki handler
- `resolved.wikiRepoUrl` → compute from `repo.url` (`.wiki.git` suffix for github/gitlab)
- `resolved.url.pathname` → `repo.url.pathname`
- `ctx.roots.wikiRoot` → from plugin/config
- `ctx.options.wikiState` → from action plugin
- `ctx.gitOps`, `ctx.log` → from plugin

### deepwiki handler
- `resolved.url.pathname` → `repo.url.pathname`
- `ctx.roots.wikiRoot` → from plugin/config
- `ctx.dexportOps` → from plugin/config
- `ctx.options.deepwikiState` → from action plugin

### archlist handler
- `resolved.url.toString()` → `repo.url.toString()`
- `ctx.options.archlistState` → from action plugin
- `ctx.log` → from plugin

### symlink handler
- `resolved` (org, project) → `repo.org`, `repo.project`
- `ctx.options.symlinkState` → from action plugin
- `ctx.roots` → from plugin/config

## How to Move Code Forward (NOT adapter)

### WRONG (previous failed attempt):
```ts
function createActionStage(handler: ActionHandler): Stage<Repo, FlowContext> {
  return async function* (input, ctx) {
    for await (const repo of input) {
      const resolved = toLegacyRepoContext(repo)  // ← BRIDGE, DO NOT DO THIS
      await handler.run(resolved, dlContext, lifecycle)
      yield repo
    }
  }
}
```

### RIGHT (direct rewrite):
```ts
function createArchiveStage(options: ArchiveStageOptions): Stage<Repo, FlowContext> {
  return async function* archiveStage(input, ctx) {
    for await (const repo of input) {
      const state = getActionState(ctx.plugins, "archive")
      if (state === OFF) { yield repo; continue }
      // do archive work directly with repo, options
      // record lifecycle directly
      yield repo
    }
  }
}
```

No adapter. No bridge. Each handler rewritten in place. The old `handler.ts` file gets replaced, not wrapped.

## Implementation Order

1. **Define stage factory pattern** — Each action domain exports a `createXxxStage()` that returns `Stage<Repo, FlowContext>`. The factory receives its config (roots, git ops, log) at construction time, not per-repo.

2. **Rewrite one handler as a stage** — Start with `archlist` (simplest: just appends URL to file). Verify it works end-to-end as a stage attached to `verifiedStages`.

3. **Update plugin to contribute stages** — `DlActionProviderExtension` adds `dl:stages`. The action plugin collects stages from extensions the same way it currently collects handlers.

4. **Wire stages into flow runner** — `runFlowCommand()` assembles collected stages into `verifiedStages` passed to `ExecuteContext`, instead of running `runPipeline` in a verified observer.

5. **Rewrite remaining handlers** — archive, wiki, deepwiki, symlink. One at a time, verifying after each.

6. **Delete old infrastructure** — `RepoContext`, `DefaultRepoContext`, `ActionHandler`, `runPipeline`, `toLegacyRepoContext`, `src/repo/base/`, `src/repo/context.ts`, old lifecycle reporter.

7. **Clean up DlContext** — Move what's needed into plugin-accessible context. Delete `DlContext` when empty.

## Key Design Decisions

### Action state access in stages
Stages read their action state from `FlowContext.plugins`. The action plugin extension should expose a way to query state, e.g.:
```ts
const state = ctx.plugins["dl:actions"].getActionState("archive")
```

### Lifecycle recording in stages
Each stage records its own lifecycle directly. This could be:
- A `report` plugin on `FlowContext.plugins` that stages call
- Or lifecycle events emitted through a stage-output side channel

The `LifecycleReporter` object pattern (ok/skipped/failed) is good, but it should be constructed from `Repo` not `RepoContext`.

### Stage construction vs runtime
Stages are created at plan-assembly time (when `runFlowCommand` runs), not at import time. Factory functions receive config (roots, gitOps, log) at construction. The stage closure captures that config.

### Error handling
Stages yield the repo onward regardless of success/failure (they are pass-through). Errors are recorded in lifecycle. The flow runner checks a collected errors list after execution to set exit code. This matches the current `actionTasks` / `Promise.all` pattern but at the stage level.

## What Was Missed / Needs Catching

### Dead code already visible in lint warnings:
- `src/repo/context.ts` — `DefaultRepoContext` imported but unused in `src/repo/base/redirect-repo.ts`
- `src/repo/provider/crates-io.ts` — `RepoContext` imported but unused
- `src/deepwiki/handler.ts` — `syncDexportWiki` imported but unused (dead import from old path)
- `src/dexport/sync.ts` — `LogExtension` imported but unused
- `src/symlink/ensure.ts` — `simplify` imported but unused

### Unused old repo infrastructure:
- `src/repo/base/` — entire directory appears to be old `RedirectRepo` class hierarchy
- `src/repo/registry.ts` — old repo registry
- `src/repo/resolve.ts` — old resolver
- `src/repo/types.ts` — old `Source` type used only by `RepoContext`

### Test over-building warning:
The previous session added 530 lines of test changes to `src/command/run.test.ts` (much of it test infrastructure helpers). When rewriting handlers as stages, write targeted unit tests for each stage factory. Do not build elaborate integration test harnesses for every stage. A stage is an async generator — test it by collecting its output with a simple helper, not by constructing full flow plugin infrastructure.

### The `wikiRepoUrl` problem:
Currently `toLegacyRepoContext()` synthesizes `wikiRepoUrl` from the repo URL (adding `.wiki.git`). In the new architecture, the wiki stage should compute this itself from `repo.url` — it's wiki-specific logic, not a generic repo property. The same applies to `wikiDeepUrl`.

### DlOptions stays but DlContext dissolves:
`DlOptions` (the CLI flag state) is still needed for option resolution. `DlContext` (runtime bag of roots/log/gitOps) gets replaced by stage factory parameters and plugin context.

## Doc References

- [`/doc/flow.md`](/doc/flow.md) — original flow architecture (older, foundational)
- [`/doc/stream-core.md`](/doc/stream-core.md) — stream vs signal decision (older, confirmed)
- [`/doc/flow-runtime-stage-plan.md`](/doc/flow-runtime-stage-plan.md) — runtime plan (newest doc, step 5 is "compose actions and views")
