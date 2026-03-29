# ADR: Immediate Fix for Single-Branch Expansion Failure

## Status

Draft

## Decision Summary

Implement a **serial but exhaustive** expansion algorithm as an immediate correction: when one candidate fails verification, continue to the next candidate from the next plausible expansion branch until all branches are exhausted (or policy says to stop after success).

This ADR is intentionally narrower than [`/doc/expansion-space.md`](/doc/expansion-space.md): it fixes the worst correctness flaw now, without requiring the full scheduler rearchitecture first.

## Problem

Today we often behave like a single-branch resolver:

- Expanders are partially mutually exclusive (notably shorthand vs dotted first segment).
- A failed candidate can effectively mean "no result" because other plausible interpretations were never generated.

This is incorrect. A miss on one interpretation is evidence to continue, not evidence to stop.

## Scope

In scope:

- Fix expansion/verification flow so alternative branches are attempted serially.
- Preserve deterministic order and low implementation risk.
- Keep current interfaces mostly intact.

Out of scope:

- Advanced wave-head scheduling policies.
- Adaptive priority updates from verification outcomes.

## Decision

### 1) Remove Branch-Exclusion Behavior

Expanders must be allowed to overlap for plausible interpretations.

- Keep safety guards for truly invalid syntax.
- Remove guards that encode exclusivity assumptions (for example: dotted first segment must not auto-disable shorthand expansion).

### 2) Introduce Serial Branch Plan

Build a deterministic ordered plan from existing expanders:

1. definitive (`url`, `ssh`)
2. likely (`host-path`)
3. speculative (`shorthand` with configured hosts)

Each branch yields zero or more candidates. Candidates remain deduped globally by canonical URL string.

### 3) Verify Serially, Continue on Miss

Verification loop must always continue after non-success outcomes:

```ts
for (const candidate of orderedCandidates) {
  const ctx = await verifyOne(candidate)
  if (!ctx) continue
  yield ctx
  if (policy.goal === "first-success") return
}
```

If policy is exhaustive (`all-successes`), continue through the full list even after success.

### 4) Add Attempt Visibility

Emit trace logs with candidate index, expander source, and outcome so we can prove alternatives were attempted.

## Concrete Interface Delta (Minimal)

No mandatory breaking change required for first step.

Keep current expander interface from [`/src/url/types.ts`](/src/url/types.ts):

```ts
export interface Expander {
  name: string
  expand(input: string): URL[]
}
```

Add lightweight planning metadata around current output:

```ts
export interface PlannedCandidate {
  url: URL
  expander: string
  tier: "definitive" | "likely" | "speculative"
  ordinal: number
}
```

`expand(...)` can return `PlannedCandidate[]` with deterministic ordering and dedupe; `verify(...)` stays serial.

## Why This Fix Is Correct

- A failed candidate no longer terminates search by omission.
- Serial order is deterministic and easy to reason about.
- Exhaustive mode remains possible and testable in current architecture.

## Example: `mary.my.id/atcute`

Ordered attempts after this ADR:

1. `host-path -> https://mary.my.id/atcute` (miss)
2. `shorthand -> https://github.com/mary.my.id/atcute` (miss)
3. `shorthand -> https://tangled.org/mary.my.id/atcute` (success)

Current worst behavior is eliminated: one miss does not block all alternatives.

## Alternatives Considered

### A. Full scheduler rearchitecture first

- Better long-term model, but slower to deliver immediate correctness.

### B. Keep current behavior and only add hosts

- Insufficient: adding hosts does not help if branch exclusion prevents those hosts from being tried.

### C. Serial exhaustive fix now (chosen)

- Corrects core failure quickly and composes with later scheduler architecture.

## Validation Criteria

- Input with multiple plausible interpretations tries more than one candidate.
- At least one test proves `miss -> continue -> success` path.
- Exhaustive mode test proves all planned candidates were attempted.
- Logs show attempt order and stop reason (`first-success`, `exhausted`, `budget`).

## Follow-On

After landing this ADR, implement the broader strategy architecture in [`/doc/expansion-space.md`](/doc/expansion-space.md) without losing the serial exhaustive correctness guarantee.
