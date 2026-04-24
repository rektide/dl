# Flow Runtime Stage Plan

## Status

Draft

## Purpose

Describe the target runtime architecture for `dl` so implementation work can continue consistently.

This plan focuses on:

- one runtime pipeline per `dl` invocation
- stage composition over `AsyncIterable<Repo>`
- plugin visibility through `ctx.plugins`
- producer-only verification with explicit reinjection
- command/action composition in one run (`--candidates --archlist` style)

## Current Direction (Confirmed)

We are standardizing on these decisions:

1. **Flow plugin owns runtime session state** (not just a builder factory)
2. **Repo stream is the normative data path**
3. **`ctx.plugins` exposes real gunshi extensions**
4. **Verification is producer-only**
5. **Reinjection is explicit** (`ctx.plugins[FLOW_PLUGIN_ID].push(...)`)
6. **Observability hooks use checkpoints** (`on("proposed"|"verified", ...)`)

Related context:

- [`/doc/flow.md`](/doc/flow.md)
- [`/doc/stream-core.md`](/doc/stream-core.md)

## Problem We Are Solving

Historically, resolution and action execution were split across old and new paths (`resolve-stream` events vs Repo flow). This made composition awkward and created verification mismatches.

We need one coherent model where:

- all command modes and actions compose into one run
- runtime state is introspectable
- reinjection is possible without hidden fallback behavior
- stages can use plugin capabilities directly from context

## Architecture Target

### Runtime API (target names)

Flow runtime session methods should be explicit and low-ambiguity:

- `config(options?)`
- `push(input)`
- `on(checkpoint, observer)`
- `execute()`

Optional fluent style:

- `flow.plan().singleton().config(...).push(...).on(...).execute()`

Compatibility alias (temporary):

- `resolveStream(...)` remains only while call-sites migrate.

### Stage Model

- Stage type remains stream-first: `Stage<TItem, TContext>`.
- Core flow is a staged transform over `Repo`.
- Candidate/verified logging and actions are `on(...)` observers or pass-through stages.

### Context Model

- `FlowContext.plugins` is a plugin map containing real gunshi extensions.
- No bespoke "service facade" wrappers.
- Runtime control is accessed via the real flow plugin extension:
  - `ctx.plugins[FLOW_PLUGIN_ID].push(...)`

### Verification and Reinjection

- Verify candidate **only** with its `producedBy` provider.
- If additional host-specific verification/enrichment is needed, do explicit reinjection.

Example:

1. `crates-io` produces `https://github.com/tokio-rs/tokio`
2. `crates-io` verifies its claim
3. runtime reinjects candidate targeted for `github` provider
4. `github` verifies/enriches that reinjected candidate

No hidden cross-provider fallback in the verify step.

## Session Lifecycle Model

Session phases should be explicit and queryable:

- `idle`
- `configured`
- `executing`
- `draining`
- `completed`
- `failed`
- `cancelled`

Suggested runtime fields:

- `phase`
- `queuedCount`
- `inFlightCount`
- `emittedProposed`
- `emittedVerified`
- `reinjectedCount`
- `highWaterTrips`
- `lastError`
- `startedAt` / `endedAt`

## Buffered Queue Role

Use [`/src/execute/buffered-async-queue.ts`](/src/execute/buffered-async-queue.ts) as push/pull bridge:

- pull API (`AsyncIterable`) stays normative
- push API supports runtime orchestration and reinjection
- high-water events support observability and policy hooks

## Implementation Plan

### Step 1: Naming and API Consolidation

Goal:

- converge runtime naming to `config/push/on/execute`
- keep temporary alias for migration safety

Work:

- rename runtime methods in flow extension
- keep `resolveStream` as alias + deprecation notes
- migrate call-sites in command/legacy paths

Acceptance:

- no ambiguity between setup and execution methods
- no behavior change in command outputs

### Step 2: Session Lifecycle State Machine

Goal:

- replace ad-hoc booleans with explicit phase model

Work:

- introduce session phase enum/constants
- update runtime transitions and guardrails
- expose snapshot/introspection API

Acceptance:

- phase transitions are deterministic
- illegal transitions throw descriptive errors

### Step 3: Signal-backed Session Metadata

Goal:

- add reactive introspection without replacing stream core

Work:

- integrate `signal-polyfill` + `signal-utils` for session fields
- keep repo flow stream-based
- publish snapshot + signal-backed reads

Acceptance:

- session fields update correctly through lifecycle
- stream execution semantics unchanged

### Step 4: Reinjection Policy Stage

Goal:

- add explicit redirect/handoff reinjection path

Work:

- define reinjection policy module
- trigger reinjection via `ctx.plugins[FLOW_PLUGIN_ID].push(...)`
- add guardrails for reinjection loops / duplicate storms

Acceptance:

- producer-only verify remains intact
- redirect-style inputs can complete via explicit reinjection

### Step 5: Compose Actions and Views in One Run

Goal:

- support combinations like `--candidates --archlist`

Work:

- make candidates/verified and actions all contribute to one runtime run
- eliminate mode short-circuiting where it blocks composition
- keep subcommands and flags both usable

Acceptance:

- `dl` can run observers and actions together in one invocation
- no duplicate resolution pipelines for mixed mode use

## Risks and Mitigations

### Risk: Reinjection loops

Mitigation:

- dedupe across reinjected candidates
- cap reinjection depth/count per input

### Risk: Runtime API churn confusion

Mitigation:

- explicit alias period (`resolveStream` -> `execute` path)
- focused rename pass and call-site cleanup together

### Risk: Over-coupling stages to plugin internals

Mitigation:

- keep stage reads narrow even with `ctx.plugins`
- document preferred plugin keys and expected contracts

## Done Criteria for This Plan

- one flow runtime API with clear setup/execute semantics
- explicit session state machine and introspection
- producer-only verify + explicit reinjection working
- mixed observers/actions in one run supported
- no legacy split-path behavior required for normal `dl` operation
