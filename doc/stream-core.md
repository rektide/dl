# Stream Core vs Signal Core

## Status

Draft

## Problem

`dl` now has one runtime flow per invocation, with multiple producers (positional/watch/clipboard and reinjection) and multiple side-effect consumers (candidate logging, verified logging, actions).

We need a core execution model that:

- keeps the repo pipeline composable
- supports push-style reinjection safely
- exposes runtime state and lifecycle clearly
- stays testable with Functional Core / Imperative Shell boundaries

## Current Recommendation

Use **async streams as the normative core** and **signals for runtime/session state**.

- Core repo data path: `AsyncIterable<Repo>`
- Push adapter: buffered async queue (`push -> pull` bridge)
- Runtime/session metadata: signals (`phase`, counters, last error, etc.)

This keeps the pipeline model simple while still enabling rich runtime introspection.

## Why Stream Core First

Pros:

- Natural fit for staged transforms (`Stage<T>` pattern)
- Existing code and tests already stream-oriented
- Easy integration with async I/O and cancellation
- Clear pull semantics for backpressure

Cons:

- Reinjection requires a push-to-pull adapter
- Session visibility must be added separately (state object/signals)

## Why Signals for Session State

Pros:

- Excellent for live runtime observability
- Minimal churn to stream pipeline logic
- Enables rich UI/monitoring later without refactoring stage flow

Cons:

- Two models to reason about (stream data + signal metadata)
- Requires discipline to avoid smuggling core data into signal channels

## Session State Machine

Session state values should be explicit and introspectable:

- `idle`: object exists, not configured
- `configured`: options/hooks/input accepted, not executing
- `executing`: pipeline running, reinjection allowed
- `draining`: input closed, finishing queued/in-flight work
- `completed`: normal terminal state
- `failed`: terminal error state
- `cancelled`: terminal aborted state

Suggested tracked fields:

- `phase`
- `queuedCount`
- `inFlightCount`
- `emittedProposed`
- `emittedVerified`
- `reinjectedCount`
- `highWaterTrips`
- `lastError`
- `startedAt` / `endedAt`

## Alternatives Considered

### A) Stream Core + Push Adapter + Signal State (Chosen)

- Best near-term fit with current architecture and migration path
- Keeps stage pipeline stable while adding strong introspection

### B) Signal Core + Stream Adapter

- All computation as signals/derivations, stream as compatibility layer
- Potentially elegant for UI/reactive systems
- High migration cost and unclear benefit for network-heavy workload

### C) Pure Stream Core (No Signals)

- Simpler implementation surface
- Weak runtime introspection; brittle for complex orchestration/debugging

## Experimental Direction (Future)

Prototype replacing the core stream with a signal-first executor using:

- `signal-polyfill`
- `signal-utils`

Evaluate against:

- implementation complexity
- correctness under reinjection
- throughput/latency
- observability quality
- test ergonomics

Do this as an isolated experiment after the current stream-based flow is stable.

## Related

- [`/doc/flow.md`](/doc/flow.md)
- [`/doc/expansion-space.md`](/doc/expansion-space.md)
- [`/src/execute/buffered-async-queue.ts`](/src/execute/buffered-async-queue.ts)
