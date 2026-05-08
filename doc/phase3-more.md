# Phase 3 follow-up: planner assembly gaps

## Status

Draft

## Purpose

Record what the phase 3 implementation changed, where it still differs from the design we were aiming for, and what the next refinement should focus on.

This follows [`/doc/phase3.md`](/doc/phase3.md). That document framed the problem as moving actions onto the flow architecture. This document starts from the implementation that landed in commit `a97e558`.

## What changed

Phase 3 made a real architectural break from the legacy bridge.

- Added a planner subsystem under [`/src/planner/`](/src/planner/).
- Added named planner stages: `proposed`, `verified`, `catalog`, `materialize`, `document`, `link`, `report`.
- Added inspectable `Binding` records with `id`, `kind`, `plugin`, `stage`, `state`, and `run(...)`.
- Added `ActionExecutionContext`, which carries `repo`, `flow`, `binding`, `state`, `args`, `services`, `facts`, and `report`.
- Added per-repo sidecar facts instead of mutating `Repo`.
- Added `FlowPlan.proposed(...)` and `FlowPlan.verified(...)` so external stages can enter the runtime.
- Rewrote action plugins to expose `actions` capabilities instead of `dl:handlers`.
- Removed `runFlowCommand`, `ActionHandler`, `runPipeline`, and the `dl:actions` aggregator.
- Changed command execution so commands call `planner.run(...)` instead of passing `showCandidates`, `showVerified`, and `runActions` flags.
- Dropped `rekon:` and `dl:` prefixes from the active plugin IDs touched during this phase.

The main design win: actions now operate on `Repo` through a planner-owned execution context. The old `RepoContext` bridge is no longer part of normal action execution.

## Target design

The design discussion converged on this shape:

```text
plugins expose capabilities
planner hosts an assembly phase
capabilities bind themselves into named stages
planner attaches bindings to the flow runtime
flow runtime executes repo streams
```

The intended separation was:

- **Stages** define flow order.
- **Actions** are user-visible effects for verified repos.
- **Views** are user-visible observations such as candidates and verified output.
- **Bindings** are the concrete record of what entered this run.
- **Planner** assembles bindings but does not become a second executor.
- **Flow** owns provider lookup, dedupe, verification, reinjection, and session lifecycle.

We also wanted the interface of command execution to disperse to responsible parties. In particular, `showCandidates`, `showVerified`, and `runActions` should disappear as explicit orchestration flags.

## Where implementation still diverges

### Planner assembly is still pull-based

The planner scans all extensions and pulls out capabilities:

```ts
const capabilities = collectActionCapabilities(core.extensions);
for (const capability of capabilities) {
  capability.assemble({ args, assembly });
}
```

This is better than `dl:handlers`, but it is not full bottom-up assembly. Plugins are still passive objects discovered by the planner. A stronger model would let plugins register with an assembly service during an explicit assembly phase.

The current shape is acceptable as a first cut because it creates inspectable bindings and removes the legacy bridge. It still leaves the planner as the active collector.

### Candidates and verified are not plugin capabilities

Candidate and verified views are hardcoded inside [`/src/planner/plugin.ts`](/src/planner/plugin.ts). They are not contributed by separate view capabilities.

That means the planner still knows about these specific view flags:

- `candidates`
- `verified`

The intended design was broader: views should be capabilities too. `--candidates` and `--verified` should register view bindings the same way `archive` registers an action binding.

### Flow still owns user-facing view flags

[`/src/plugin/flow.ts`](/src/plugin/flow.ts) still registers:

- `--candidates`
- `--verified`
- `--dry-run`
- `--report-lifecycle`

This is blurry now. The flow plugin should own runtime mechanics, not user-facing command intent. `--candidates` and `--verified` are planner/view concerns. `--report-lifecycle` is probably a reporting concern. `--dry-run` is action/planner intent.

The next pass should move these flags to the subsystem that consumes them.

### The planner plugin is too large

[`/src/planner/plugin.ts`](/src/planner/plugin.ts) does too much:

- scans extensions
- builds args
- creates view bindings
- creates lifecycle/report bindings
- resolves services
- creates action run state
- orders stage groups
- attaches stages to the flow plan
- executes the flow plan
- shapes the final result

This violates the spirit of the lightweight gunshi plugin goal. The plugin is currently the imperative shell and most of the planning logic. We should extract a functional planner core that accepts capabilities, args, and options, then returns a `RunPlan` or `BindingPlan`.

The gunshi plugin should mostly gather extensions and call the core planner.

### Stage ordering is named but not extensible

The implementation has named stages, but the order is still a hardcoded array:

```ts
const ACTION_STAGE_ORDER = [
  STAGE.verified,
  STAGE.catalog,
  STAGE.materialize,
  STAGE.document,
  STAGE.link,
  STAGE.report,
];
```

This is much better than numeric ordering, but it is not yet a lifecycle registry. A Maven-like model would make stage order a first-class lifecycle definition, probably in planner core.

We do not need a full dependency graph yet. But stage order should be data, not an implementation detail inside the plugin shell.

### `Binding.kind = "stage"` is not real yet

`BindingKind` includes `"stage"`, but every binding still lowers through `createBindingStage(...)`, which calls `binding.run(ctx)` per repo.

That means `kind: "stage"` is currently only a label. There is no escape hatch for a binding that wants to provide a raw `Stage<Repo, FlowContext>`.

This is not blocking actions. It does mean the type promises more than the implementation supports.

Options:

- Remove `"stage"` until there is a real stage-binding contract.
- Add a separate `streamStage` field or `runStage(...)` contract.
- Keep `kind: "stage"` as reserved, but document that it is not supported yet.

The cleanest near-term option is to remove it.

### Services are resolved even for view-only runs

The planner resolves roots, git ops, and dexport ops before attaching bindings, even when only `--candidates` is requested.

This weakens the design boundary. A candidates-only invocation should not need archive roots or action services. Services should be lazily bound, or action service resolution should only happen if action/report bindings need it.

This matters because planner should become safe to use for lightweight views. A view-only plan should remain cheap and avoid unrelated configuration failures.

### Reporting is still transitional

The new action context has a `report` field, which is good. But it still uses [`/src/action/lifecycle.ts`](/src/action/lifecycle.ts), and the planner manually installs lifecycle bindings.

Two awkward spots remain:

- `createBindingStage(...)` creates a generic error record when an action returns `{ hadError: true }`.
- Actions also create specific failure records themselves.

That can produce redundant lifecycle failures. The old `runPipeline` only synthesized a generic failure for thrown exceptions. We should probably return to that behavior: thrown exceptions get generic failure records, explicit `hadError` means the action already reported the details.

Longer term, [`/doc/log.md`](/doc/log.md) still points toward a proper reporting subsystem. Phase 3 should not solve all reporting, but it should not make reporting semantics fuzzier.

### Flow counters do not count planner stages

`FlowSessionSnapshot.emittedProposed` and `emittedVerified` are incremented by observer stages created from `plan.on(...)`. Planner bindings use `plan.proposed(...)` and `plan.verified(...)`, so planner-installed work does not naturally affect those counters.

This is a semantic mismatch. If the snapshot says “emitted verified,” it should count verified repos crossing the checkpoint, not just observer invocations.

Possible fix: move emission counting into the executor around checkpoint boundaries rather than observer stages.

### Naming cleanup is incomplete

The active plugin IDs touched by this phase dropped `rekon:` and `dl:` prefixes. But some names still carry old vocabulary:

- `dlPlugins`
- `dlArchiveActionPlugin`
- `dlWikiActionPlugin`
- display names like `DL Wiki Action`
- `DlArgs` in the command layer

This is mostly cosmetic, but names affect architecture. If the new concepts are `planner`, `action`, `binding`, and `stage`, the code should use those terms consistently.

### Legacy repo code still exists

The normal action path no longer uses `RepoContext`, `ActionHandler`, or `runPipeline`. But the older `src/repo/` provider stack and `repoPlugin` still exist.

This is a separate cleanup. Some `src/repo/` utilities are still used by the new provider system, so we should not delete the whole directory blindly. The likely split is:

- keep URL parsing and cleaning utilities
- remove old provider base classes, old registry, old resolver, and old repo plugin after confirming no command uses them

## Suggested next refinement

The next pass should not rewrite the action migration. It should make the planner design truer.

### 1. Extract planner core

Create planner core modules that are not gunshi plugins:

```text
src/planner/
  types.ts
  args.ts
  bindings.ts        # collect/order/group bindings
  lifecycle.ts       # stage lifecycle definition
  plan.ts            # createBindingPlan(...)
  run-state.ts
  stages.ts
  plugin.ts          # thin gunshi shell
```

`plugin.ts` should gather extensions and services, then delegate.

### 2. Make views capabilities

Introduce view capabilities so `candidates` and `verified` follow the same assembly path as actions.

This would remove planner hardcoding like:

```ts
if (values.candidates === true) bindings.push(...)
if (values.verified === true) bindings.push(...)
```

The planner should not know which views exist.

### 3. Move intent flags out of flow

Move user-facing flags to the subsystem that owns them:

- candidate/verified flags to view capabilities
- report lifecycle flag to reporting or planner
- dry-run to planner/action services

Flow should keep only flow-runtime options.

### 4. Make service resolution demand-driven

Do not resolve roots/git/dexport for candidate-only runs.

One simple option: create services lazily inside `ActionExecutionContext`. Another option: split `ViewServices` from `ActionServices` so view bindings do not require action services.

### 5. Clarify binding kinds

Either remove `kind: "stage"` or implement it.

If implemented, raw stage bindings need a different contract from repo action/view bindings. Do not force stream stages through `ActionExecutionContext`.

### 6. Tighten reporting semantics

Change `createBindingStage(...)` so generic lifecycle failures are only added for thrown exceptions. If a binding returns `{ hadError: true }`, assume it already recorded the domain-specific failure.

### 7. Update names

Rename old `dl*` symbols that are now misleading. This should be mechanical and separate from semantic changes.

## Proposed success criteria

The planner refinement is successful when:

- `plannerPlugin` is a thin shell.
- Views and actions both register through capabilities.
- The planner does not hardcode `candidates`, `verified`, or individual action names.
- View-only runs do not resolve action services.
- Binding manifests clearly show what ran and where.
- Flow runtime still owns provider lookup, dedupe, verification, reinjection, and session lifecycle.
- Actions stay repo-native and do not reintroduce `RepoContext`.

## Bottom line

The phase 3 implementation moved the system decisively away from the legacy action pipeline. That was the hard part.

The remaining work is architectural cleanup: make the planner less central, make views real capabilities, move user intent out of flow, and make the gunshi plugin a thin assembly shell. The current code is a good bridge to that target, but it is not the final planner design.
