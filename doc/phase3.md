# Phase 3: Actions Become Stages

## Status

Draft

## Purpose

Checkpoint where we are after phases 1 and 2, calibrate against original design intent, and set direction for converting actions into flow stages.

Reference documents that the implementing session should read:
- [`/doc/flow.md`](/doc/flow.md) — overall flow architecture and invariants
- [`/doc/flow-runtime-stage-plan.md`](/doc/flow-runtime-stage-plan.md) — 5-step runtime plan
- [`/doc/stream-core.md`](/doc/stream-core.md) — stream core vs signal core decision

---

## Calibration: Where We Are vs Where We Intended to Be

### Done criteria from flow-runtime-stage-plan.md

The plan listed five done criteria. Honest assessment:

1. **"one flow runtime API with clear setup/execute semantics"** — Delivered. [`FlowExtension`](/src/plugin/flow.ts:114) exposes `config/push/on/execute` with a fluent `plan()` builder. The old `resolveStream` alias is gone.

2. **"explicit session state machine and introspection"** — Delivered. [`FLOW_SESSION_PHASE`](/src/plugin/flow.ts:150) has `idle/configured/executing/draining/completed/failed/cancelled` with guardrails. [`snapshot()`](/src/plugin/flow.ts:416) exposes counters, handoffs, timestamps.

3. **"producer-only verify + explicit reinjection working"** — Delivered, but the shape differs from what the plan described. The plan called for a "reinjection policy stage." What we built instead: redirect providers call [`runtime.push()`](/src/provider/redirect.ts:48) directly, with dedupe in [`enqueue()`](/src/plugin/flow.ts:297). Same goal, different mechanism. The plan's step 4 described a stage; we moved that responsibility to the provider level. This seems like an improvement — redirect is now a provider concern, not a flow-stage concern.

4. **"mixed observers/actions in one run supported"** — Delivered. [`runFlowCommand()`](/src/command/run.ts:113) composes candidate logging, verified logging, and action execution onto one flow plan. `--candidates --verified` and `--candidates --archlist` both work.

5. **"no legacy split-path behavior required for normal dl operation"** — **Partial.** The mode branching is gone (no more `if (candidates) return; if (verified) return;`), but actions still go through [`toLegacyRepoContext()`](/src/command/run.ts:34) → [`runPipeline()`](/src/action/pipeline.ts:8) inside a verified observer. This is the remaining legacy bridge. Normal `dl` operation depends on `src/repo/context.ts`, `src/action/handler.ts`, and `src/action/pipeline.ts` — all of which were supposed to be transitional.

### Migration direction from flow.md

flow.md listed five migration steps. Where they stand:

1. "Introduce new `flow/` + `execute/` contracts and tests" — Done.
2. "Port providers to symmetric stateless contract" — Done. [`src/provider/`](/src/provider/) is the active system.
3. "Build unified input plugin and concurrent `fan-in.ts`" — Done.
4. "Add flow plugin and move `dl` command to thin consumer" — Partially done. `dl` is thinner, but the action bridge keeps it from being truly thin.
5. "Remove legacy resolver/paths after parity tests pass" — **Not done.** This is what phase 3 is.

### Invariants from flow.md

- "A miss from one provider does not prevent other providers from attempting" — Held.
- "Dedupe is global and deterministic" — Held.
- "Producer provenance is never overwritten" — Held.
- "Providers remain stateless" — Held.
- "Flow core remains usable outside gunshi plugin wiring" — **Uncertain.** The executor and stage system work independently, but [`flowPlugin`](/src/plugin/flow.ts:251) is a gunshi plugin. The core logic is separable in principle, but hasn't been tested outside gunshi wiring.

### What was deferred

- **Signal-backed session metadata** (plan step 3) — explicitly deferred per [`/doc/stream-core.md`](/doc/stream-core.md). Stream core works; signals are a future experiment.
- **`flow/steps/types.ts`**, **`flow/compose.ts`** from the flow.md directory layout — never materialized. Composition is inline in the executor. The simpler `Stage` type won over the branded `RepoStep` / `RepoStream` types flow.md originally described.
- **`execute/runtime.ts`** from flow.md — never created. [`flowPlugin`](/src/plugin/flow.ts) serves the runtime composition role instead.

### Things that drifted from the plan without being reconsidered

- The plan said "keep `resolveStream` as alias + deprecation notes." We deleted it entirely instead. Good decision, but not what was planned.
- The plan said "define reinjection policy module." We put handoff logic directly into [`enqueue()`](/src/plugin/flow.ts:297) and the flow plugin. No separate module.
- flow.md described a `RepoStep<I extends Repo, O extends Repo>` with branded stream types. We went with a simpler unbranded [`Stage`](/src/execute/stage.ts). This is fine, but it's a deviation.

---

## What Phase 3 Is Trying to Do

The original plans don't describe "phase 3" as a named thing. They describe it implicitly through:

1. flow.md's migration step 5: "Remove legacy resolver/paths after parity tests pass."
2. flow-runtime-stage-plan.md's done criterion: "no legacy split-path behavior required for normal dl operation."
3. flow.md's architecture: "pass verified repos to action handlers" — where handlers are stages in the pipeline, not observer callbacks.

The core intent: **the flow pipeline should be the only execution path. There should be no bridge, no `RepoContext`, no separate `runPipeline`.**

What that means concretely:

- Each action (archive, wiki, deepwiki, archlist, symlink) operates as a [`Stage<Repo, FlowContext>`](/src/execute/stage.ts) in the verified-stages portion of the flow pipeline.
- Gunshi plugins contribute these stages. The current [`DlActionProviderExtension`](/src/action/registry.ts:27) contributes `dl:handlers: ActionHandler[]`. That needs to change.
- `RepoContext` ([`src/repo/context.ts`](/src/repo/context.ts)) is deleted. All its fields are either already on `Repo` or are handler-specific computations (like `wikiRepoUrl`).
- `runPipeline()` ([`src/action/pipeline.ts`](/src/action/pipeline.ts)) is eliminated. Stages compose in the flow.
- `DlContext` ([`src/action/types.ts`](/src/action/types.ts)) goes away. Its contents (roots, gitOps, log, options) come from somewhere else — where exactly is an open design decision.

### Previous failed attempt

A prior session tried this by creating an adapter: `createActionStage(handler)` that wrapped old handlers inside a stage, still converting `Repo` → `RepoContext` internally. This was rejected because it preserved the bridge instead of eliminating it. Each handler needs to be rewritten to work with `Repo` directly.

---

## Open Design Decisions

These are questions phase 3 needs to answer. The plans do not prescribe answers.

### How do plugins contribute stages?

Currently [`DlActionProviderExtension`](/src/action/registry.ts:27) has `dl:handlers: ActionHandler[]`. That becomes stages somehow. Options:

- Plugins contribute `Stage<Repo, FlowContext>[]` directly
- Plugins contribute stage factories that receive config (roots, gitOps, etc.)
- Something else

The stage type is `Stage<TItem, TContext>` = `(input: AsyncIterable<TItem>, ctx: TContext) => AsyncIterable<TItem>`. Stages need config (file paths, git operations) that aren't on `FlowContext`. When and how does that config get bound?

### How do stages access their action state?

Currently each handler reads `ctx.options.archiveState`, `ctx.options.wikiState`, etc. from [`DlOptions`](/src/action/types.ts:6). In the new world, stages receive `FlowContext` which has `plugins` but not `DlOptions`. How does a stage know whether it should run?

### Where do runtime dependencies (roots, gitOps, log) come from?

`DlContext` currently bundles: `roots` (file paths), `gitOps`, `dexportOps`, `log`, and `options`. These are resolved in [`resolveDlSetup()`](/src/command/context.ts). In the new world, stages need these but don't receive `DlContext`. Plugin extensions? Config objects? Flow context fields?

### How does lifecycle reporting work?

Currently [`LifecycleReporter`](/src/action/lifecycle.ts:38) is created per-repo inside `runPipeline()`, passed to each handler, then summarized. In the new world, stages would need to record lifecycle events. [`doc/log.md`](/doc/log.md) describes a reporting redesign that's relevant but not blocking.

### How are errors collected and reported?

Currently [`runFlowCommand()`](/src/command/run.ts:134) collects `actionTasks: Promise<boolean>[]` and awaits them after flow execution. With stages, errors happen inside the async generator pipeline. The current sequential observer pattern works; a stage-based approach may need a different mechanism for setting the process exit code.

### What about the `src/repo/` directory?

[`src/repo/`](/src/repo/) contains older infrastructure: `RepoContext`, `DefaultRepoContext`, `RedirectRepo`, `HostRepo` base classes, an old registry and resolver. [`src/provider/`](/src/provider/) is the active provider system. How much of `src/repo/` is dead code? What's still used?

---

## Supplemental: Author's Observations

These are opinions and suggestions, not plan directives.

### On what went well

The flow runtime is genuinely good. The session lifecycle, the plan API, the buffered queue with handoff tracking — these feel solid and not over-engineered. Provider-level redirect handoff (providers calling `runtime.push()` instead of yielding redirect repos) was a good call that simplified the pipeline.

The `runFlowCommand()` composition in phase 2 is clean. The fact that `--candidates --verified` and `--candidates --archlist` both work through one plan is a real improvement over the old mode-branching.

### On what's still awkward

The `toLegacyRepoContext()` bridge in [`run.ts`](/src/command/run.ts:34) is the obvious one. But also: `DlOptions` is a wide bag with five action states baked into it. Action state resolution ([`resolveActionStates()`](/src/action/registry.ts:159)) is clever but complex — the "any explicit flag turns off all non-explicit actions" policy is hard to reason about.

The dual logging systems (fire-and-forget `ext.log` vs accumulator `LifecycleReporter`) are a real friction point. Handlers do both: they call `ctx.log.info()` for human output and `lifecycle.ok()` for structured reporting. This isn't a phase 3 problem per se, but it's worth knowing that stage-based lifecycle will run into it.

### On test approach

[`src/command/run.test.ts`](/src/command/run.test.ts) grew significantly in phase 2 with mock extension infrastructure. For phase 3: a stage is an async generator. Testing one should be as simple as feeding it repos and collecting output — no flow plugin mocks needed. The existing [`processRepoContext`](/src/command/run.test.ts:66) tests that use real (mocked I/O) handlers are a better pattern than the in-memory extension mocks.

### On the `repo/` question

I suspect `src/repo/base/` (the `RedirectRepo`/`HostRepo` class hierarchy) is entirely dead. The active providers in `src/provider/` don't extend these classes. But `src/repo/clean-url.ts` and `src/repo/parse.ts` are actively used. An audit pass would be valuable before phase 3 starts deleting things.

### On phase 3 scope

The minimum viable phase 3 is: handlers become stages, `RepoContext` is deleted, `runPipeline` is deleted. Everything else (reporting redesign, signal metadata, directory reorganization) can happen after. Don't let the reporting redesign ([`doc/log.md`](/doc/log.md)) block this work.

---

## Supplemental: Suggested Architecture

One possible way to resolve the open design decisions above. Not plan-directive — just a concrete proposal to evaluate against alternatives.

### Plugin contributes stage factories

```ts
interface DlActionProviderExtension {
  readonly "dl:actions": ReadonlyArray<DlActionSpec>
  readonly "dl:stages": (options: DlOptions) => ReadonlyArray<Stage<Repo, FlowContext>>
}
```

The factory receives `DlOptions` so each action can check its own state (`options.archiveState`) and decide whether to include itself. The flow runner calls all factories and assembles the resulting stages into `verifiedStages`.

### Stages are constructed with config at plan-assembly time

```ts
function createArchiveStage(config: { archiveRoot: string; gitOps: GitOps; log: LogExtension }): Stage<Repo, FlowContext> {
  return async function* archiveStage(input, ctx) {
    for await (const repo of input) {
      // check action state from ctx.plugins
      // do work with repo, config.archiveRoot, config.gitOps
      // record lifecycle
      yield repo
    }
  }
}
```

Config (roots, gitOps, dexportOps, log) is bound at construction time, not per-repo. The stage closure captures it. This avoids putting I/O dependencies on `FlowContext`.

### Action state accessed from plugin context

The action plugin extension exposes a state query:

```ts
const state = ctx.plugins["dl:actions"].getActionState("archive")
```

This lets each stage check its own state without receiving `DlOptions` directly. The action plugin resolves states using the existing [`resolveActionStates()`](/src/action/registry.ts:159) logic.

### Lifecycle: stages call a report plugin

```ts
const reporter = ctx.plugins["rekon:report"]
reporter.ok({ step: "archive", source: "archiveStage", transition: "cloned", details: { destination } })
```

The `LifecycleReporter` pattern (ok/skipped/failed) is good. A report plugin on `FlowContext.plugins` makes it available to any stage without passing it as a parameter. If the report plugin from [`doc/log.md`](/doc/log.md) isn't ready, a thin wrapper around the existing `LifecycleReporter` interface (but constructed from `Repo`, not `RepoContext`) would work.

### Errors: stages yield onward, record failures

Stages are pass-through — they yield `repo` regardless of success or failure. Errors are recorded in lifecycle. The flow runner collects errors (either through the report plugin or through a side-channel accumulator) to set the exit code. This mirrors the current `actionTasks` / `Promise.all` pattern but at the stage level.

### RepoContext field mapping

What `RepoContext` carries that `Repo` does not, and where each goes:

| RepoContext field | Where it goes instead |
|---|---|
| `wikiRepoUrl` | Computed inside wiki stage from `repo.url` (`.wiki.git` for github/gitlab) |
| `wikiDeepUrl` | Computed inside deepwiki stage from `repo.url` |
| `source.provider` | `repo.producedBy` |
| `verified` | `repo.state === "verified"` |
| `input`, `org`, `project`, `host` | Already on `Repo` |

The `wikiRepoUrl` and `wikiDeepUrl` computations currently live in [`toLegacyRepoContext()`](/src/command/run.ts:48). They move into their respective stages.

### Handler dependency inventory

What each handler currently reads from `RepoContext` and `DlContext`, for the rewriter's reference:

**archive** ([`src/archive/handler.ts`](/src/archive/handler.ts)) — `resolved.url`, `ctx.roots.archiveRoot`, `ctx.gitOps`, `ctx.options.archiveState`, `ctx.log`, `lifecycle`

**wiki** ([`src/wiki/handler.ts`](/src/wiki/handler.ts)) — `resolved.wikiRepoUrl` (computed from url), `resolved.url.pathname`, `ctx.roots.wikiRoot`, `ctx.options.wikiState`, `ctx.gitOps`, `ctx.log`, `lifecycle`

**deepwiki** ([`src/deepwiki/handler.ts`](/src/deepwiki/handler.ts)) — `resolved.url.pathname`, `ctx.roots.wikiRoot`, `ctx.dexportOps`, `ctx.options.deepwikiState`, `ctx.log`, `lifecycle`

**archlist** ([`src/archlist/handler.ts`](/src/archlist/handler.ts)) — `resolved.url.toString()`, `ctx.options.archlistState`, `ctx.log`, `lifecycle`

**symlink** ([`src/symlink/handler.ts`](/src/symlink/handler.ts)) — `resolved.org`, `resolved.project`, `ctx.options.symlinkState`, `ctx.roots`, `ctx.log`, `lifecycle`

### Suggested implementation order

1. Start with **archlist** — simplest handler (appends URL to file). Rewriting it as a stage validates the pattern before touching complex handlers.
2. Update the plugin extension to contribute stages alongside (or instead of) handlers.
3. Wire stages into [`runFlowCommand()`](/src/command/run.ts:113) as `verifiedStages`.
4. Convert remaining handlers one at a time: archive, wiki, deepwiki, symlink.
5. Delete `RepoContext`, `DefaultRepoContext`, `ActionHandler`, `runPipeline`, `toLegacyRepoContext`, `src/repo/base/`.

### Dead code to clean up

Standing lint warnings that point to code phase 3 should delete:

- `DefaultRepoContext` imported but unused in [`src/repo/base/redirect-repo.ts:1`](/src/repo/base/redirect-repo.ts)
- `RepoContext` imported but unused in [`src/repo/provider/crates-io.ts:1`](/src/repo/provider/crates-io.ts)
- `syncDexportWiki` imported but unused in [`src/deepwiki/handler.ts:7`](/src/deepwiki/handler.ts)
- `LogExtension` imported but unused in [`src/dexport/sync.ts:2`](/src/dexport/sync.ts)
- `simplify` imported but unused in [`src/symlink/ensure.ts:4`](/src/symlink/ensure.ts)
- `originalCallback` unused in [`src/command/input.ts:131`](/src/command/input.ts)

Larger dead code suspects:

- `src/repo/base/` — entire `RedirectRepo`/`HostRepo` class hierarchy, likely unused since `src/provider/` is active
- `src/repo/registry.ts` — old repo registry
- `src/repo/resolve.ts` — old resolver
- `src/repo/types.ts` — old `Source` type, only used by `RepoContext`

### Test guidance

[`src/command/run.test.ts`](/src/command/run.test.ts) grew from 131 lines (2 tests) to ~420 lines (6 tests) in phase 2, much of it mock extension infrastructure. For phase 3:

- Test individual stages in isolation — a stage is an async generator, feed it repos and collect output
- Don't build elaborate integration test harnesses for each stage
- The existing [`processRepoContext`](/src/command/run.test.ts:66) tests with real (mocked I/O) handlers are the right pattern
- `runFlowCommand()` needs only a thin integration test verifying stage assembly

### NOT this: the adapter mistake

A prior session attempted phase 3 with an adapter pattern:

```ts
// WRONG: wraps old handler, preserves RepoContext bridge
function createActionStage(handler: ActionHandler): Stage<Repo, FlowContext> {
  return async function* (input, ctx) {
    for await (const repo of input) {
      const resolved = toLegacyRepoContext(repo)  // bridge
      await handler.run(resolved, dlContext, lifecycle)
      yield repo
    }
  }
}
```

This was rejected. Each handler must be rewritten to work with `Repo` directly, not wrapped. The old `handler.ts` file gets replaced, not wrapped. Move the code forward.
