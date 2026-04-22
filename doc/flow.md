# Flow Architecture for `dl`

## Status

Draft

## Purpose

Define a clean architecture for `dl` centered on a composable flow system, with clear Functional Core / Imperative Shell boundaries, plugin-based runtime wiring, and no "provider becomes repo" conflation.

This document is the target shape for re-engineering before splitting `dl` into its own project.

## Terminology

- **Flow**: end-to-end resolution process from raw input to verified repos.
- **Step**: stream transform over `Repo` values (example: dedupe).
- **Executor**: imperative runtime that drives a flow.
- **Provider**: stateless strategy that both proposes and verifies.
- **Input source**: positional, watch, clipboard, etc.

We use "flow" as the top-level term. "Pipeline" can appear informally, but code and docs should prefer "flow".

## Core Architecture

### Functional Core

Pure logic, deterministic, side-effect free:

- repo state machine
- step interfaces and composition
- dedupe identity rules
- provider applicability predicates (early return checks)
- flow planning / ordering policy

### Imperative Shell

I/O and runtime concerns:

- network verification
- watch and clipboard input streams
- cancellation and timeout behavior
- plugin wiring
- logging and lifecycle emission

## Directory Layout

```text
src/
  flow/
    types.ts          # high-visibility flow contracts
    model.ts          # Repo state constants and transitions
    compose.ts        # step composition helpers
    steps/
      types.ts        # shared step-level contracts
      dedupe.ts       # dedupe as a first-class step
      verify.ts       # producer-first verify step

  execute/
    types.ts          # runtime/executor contracts
    executor.ts       # imperative flow driver
    fan-in.ts         # concurrent async source merge
    runtime.ts        # compose providers, policies, executor

  provider/
    types.ts          # provider and registry interfaces
    registry.ts       # provider catalog and selection helpers
    github.ts
    gitlab.ts
    tangled.ts
    generic.ts
    ...

  input/
    types.ts          # input source contracts
    positional.ts
    watch.ts
    clipboard.ts

  plugin/
    input.ts          # contributes input args + exposes unified input stream
    flow.ts           # exposes flow execution extension

  command/
    dl.ts             # thin command: input plugin + flow plugin + action usage
```

## `types.ts` Policy

Use `types.ts` files for high-visibility shared contracts.

- Put cross-file domain interfaces in `types.ts` at that domain root.
- Keep implementation-local helper types near implementation files.
- Prefer importing from `types.ts` when a type is shared by multiple modules.
- Avoid one giant global types file; keep types scoped by domain.

## Repo Model and State Machine

Keep one `Repo` entity with explicit state transitions.

```ts
export const REPO_STATE = {
  candidate: "candidate",
  verified: "verified",
} as const

export type RepoState = (typeof REPO_STATE)[keyof typeof REPO_STATE]

export interface Repo {
  id: string
  input: string
  url: URL
  org?: string
  project?: string
  state: RepoState
  producedBy: string
  verifiedBy: ReadonlySet<string>
}
```

No provider-owned mutable repo state. Repo records flow through steps; providers are stateless functions/objects.

## Provider Contract (Symmetric)

Each provider does both candidate generation and verification.

```ts
export interface Provider {
  name: string
  hosts: readonly string[]
  candidates(input: string): AsyncGenerator<Repo>
  verify(repo: Repo, signal: AbortSignal): AsyncGenerator<Repo>
}
```

Notes:

- `hosts` remains metadata/hints (canonicalization, diagnostics, cheap prefilter), not ownership.
- Hostless inputs are normal; all providers may run and early return when not applicable.
- Example: `mary.my.id/atcute` is not assumed to be a host; providers decide applicability.

## Registry Behavior

Registry is a provider catalog, not a host-owner router.

- `lookup` may remain as a name, but returns multiple providers.
- Typical behavior: run all providers for ambiguous inputs.
- Optional host-indexed narrowing is an optimization, never a correctness gate.

## Step System

Flow is composed from branded stream steps.

```ts
declare const repoStreamBrand: unique symbol
declare const repoStepBrand: unique symbol

export interface RepoStream<T extends Repo> extends AsyncIterable<T> {
  readonly [repoStreamBrand]: T
}

export interface RepoStep<I extends Repo, O extends Repo> {
  readonly name: string
  readonly [repoStepBrand]: { in: I; out: O }
  run(input: RepoStream<I>, ctx: FlowContext): RepoStream<O>
}
```

`dedupe` is implemented as a normal step using `Set<string>` identity keys.

## Execution Model

`/src/execute/executor.ts` drives the flow:

1. receive unified input stream
2. run candidate steps
3. run dedupe step
4. run verify steps (producer-first, optionally others)
5. emit flow events

`/src/execute/fan-in.ts` merges positional/watch/clipboard concurrently.

## Plugin Integration

### `/src/plugin/input.ts`

- contributes input-related args (`--org`, `--watch`, `--clipboard`, etc.)
- exposes one typed input stream extension

### `/src/plugin/flow.ts`

- exposes `runFlow(inputs, options)` and typed flow events
- owns runtime composition (providers + executor + policy)

### `/src/command/dl.ts`

Thin orchestration only:

- get stream from input plugin
- execute flow via flow plugin
- pass verified repos to action handlers

## Invariants

- A miss from one provider does not prevent other providers from attempting.
- Dedupe is global and deterministic.
- Producer provenance is never overwritten.
- Providers remain stateless.
- Flow core remains usable outside gunshi plugin wiring.

## Migration Direction

1. Introduce new `flow/` + `execute/` contracts and tests.
2. Port providers to symmetric stateless contract.
3. Build unified input plugin and concurrent `fan-in.ts`.
4. Add flow plugin and move `dl` command to thin consumer.
5. Remove legacy resolver/paths after parity tests pass.

## Related Docs

- [`/doc/expansion-space.md`](/doc/expansion-space.md)
- [`/doc/expansion-serial-exhaustive.md`](/doc/expansion-serial-exhaustive.md)
- [`/doc/expansion-heads.md`](/doc/expansion-heads.md)
