# Expansion Heads: The Problem and Proposed Solutions

## Current Architecture

The dl pipeline has a clean layered design:

```
Input → expand() → verify() → enrich() → sync
```

**`expand()`** runs all registered expanders against the input, collects every candidate URL they produce, and deduplicates by URL identity. Each expander returns an array of URLs — the interface is `expand(input: string): URL[]`.

**`verify()`** iterates all candidates sequentially, attempts to resolve each via the provider registry, and yields only the ones that succeed. Failures are silently skipped with `if (!ctx) continue`.

This architecture is explicitly designed to **expand widely, then collapse down** to what actually resolves.

## The Problem: Mutual Exclusion Defeats Expansion

The expanders contain guards that prevent them from overlapping, which completely undermines the expand-then-collapse design:

- `hostPathExpander`: activates when `firstSegment.includes(".")` — treats the first segment as a hostname
- `shorthandExpander`: **bails** when `firstSegment.includes(".")` — refuses to process dotted first segments

These guards create a **partition** over input space rather than allowing speculative overlap. Each expander claims an exclusive domain and produces exactly one candidate (or zero). The result is that `expand()` almost always returns a single candidate — making the multi-candidate pipeline pointless.

### Concrete Failure: `mary.my.id/atcute`

`mary.my.id` is an ATProto DID handle, not a git host. The repo actually lives at `https://tangled.org/mary.my.id/atcute`. Here's what happens:

1. `sshExpander` — no match (no `git@` prefix)
2. `urlExpander` — no match (no `://` scheme)
3. `hostPathExpander` — **claims it**: `mary.my.id` has a dot, so it produces `https://mary.my.id/atcute`
4. `shorthandExpander` — **skips it**: `mary.my.id` has a dot, so it produces nothing
5. `expand()` returns one candidate: `https://mary.my.id/atcute`
6. `verify()` HEADs `https://mary.my.id/atcute` → 404 → yields nothing
7. **Silent failure. No repo found.**

What should have happened: shorthandExpander (or some expander) should have also produced `https://tangled.org/mary.my.id/atcute` as a speculative candidate. verify would have tried `mary.my.id` (fail), continued, tried `tangled.org` (success), and yielded it.

### Why "First Expander Wins" Is Wrong

The current behavior effectively treats expanders as a prioritized fallback chain: the first expander that matches claims the input exclusively. This is wrong because:

- **The first expander has no special authority.** A dotted first segment could be a hostname OR an ATProto handle OR something else entirely. The expander can't know without probing.
- **The verify stage exists precisely to filter.** The whole point of expand-then-collapse is that expanders produce speculative candidates and verify filters them. When expanders only produce a single candidate, verify has nothing to filter.
- **It conflates "looks like X" with "is X".** Pattern matching on the input string is cheap but imprecise. Multiple interpretations may be valid — that's why we have multiple expanders.

## The Deeper Issue: Expansion Heads

Right now each expander produces all its candidates at once. For shorthandExpander with `defaultHosts: ["github.com"]`, input `org/repo` produces one candidate. With `["github.com", "gitlab.com"]` it produces two. That's the only axis of expansion.

But the real question is: how many expansion "heads" do we open, and in what order do we sample them?

Consider an input that could plausibly be interpreted by 3 expanders, each producing 2 candidates. That's 6 candidates. If we validate them sequentially, we'd do 6 HTTP requests (or git ls-remote calls) before yielding. But if the correct answer is candidate #1, we wasted 5 probes. And if we stop at the first success, we never discover that candidates #4 and #6 might also be valid repos (just different forges mirroring the same project).

### What We Actually Want

We want **lateral sampling** across expanders before going deeper into any one expander's candidates. This ensures no single expander's interpretation dominates before others get a chance.

## Proposed Expansion Modes

### Mode 0: Current (First-Match Exclusive)

```
expanders run independently
each produces 0 or 1 candidates (due to guards)
verify tries them in order, stops effectively after first resolution
```

**What's wrong**: expanders fence each other out. Only one interpretation is tested.

### Mode 1: Greedy Expansion (All At Once)

Remove mutual exclusion guards. Every expander that can plausibly interpret the input produces candidates. All candidates go to verify.

```
hostPathExpander("mary.my.id/atcute") → [https://mary.my.id/atcute]
shorthandExpander("mary.my.id/atcute") → [
  https://github.com/mary.my.id/atcute,
  https://tangled.org/mary.my.id/atcute,
  ...all defaultHosts
]
```

All candidates get verified. First success wins (verify yields it, caller can stop or continue).

**Pros**: Simple. Uses the existing expand-then-collapse architecture as designed.
**Cons**: If defaultHosts is large, this fans out widely. Most candidates will fail. For an input like `org/repo` (no dot), shorthand already handles it — removing the guard would make hostPath ALSO try to interpret it as a hostname, which is wasteful. Some guards are still needed to avoid nonsense expansions.

### Mode 2: Round-Robin Lateral Sampling

Structure expansion as rounds. In round 1, ask each expander for its first (best) candidate. Verify those. If none resolve, round 2: ask each expander for its next candidate. Continue until all expanders are exhausted or a resolution is found.

```
Round 1: [hostPath→https://mary.my.id/atcute, shorthand→https://github.com/mary.my.id/atcute]
  → verify both → both fail
Round 2: [shorthand→https://tangled.org/mary.my.id/atcute]
  → verify → success → yield
```

**Pros**: Guarantees lateral sampling. No expander dominates before others get a chance. Efficient — early rounds are small, deeper rounds only happen on failure.
**Cons**: Requires expanders to support ordered/lazy candidate generation instead of returning all at once. More complex interface.

### Mode 3: Tiered Expansion

Expanders declare a confidence tier (0 = speculative, 1 = likely, 2 = definitive). Verification proceeds tier-by-tier:

```
Tier 2 (definitive): urlExpander("https://git.ffmpeg.org/ffmpeg.git") → exact URL
  → verify → resolve? done.
  → fail? fall through
Tier 1 (likely): hostPathExpander → direct host-path interpretation
  → verify → resolve? done.
  → fail? fall through
Tier 0 (speculative): shorthandExpander → fan out to all defaultHosts
  → verify all → first success wins
```

**Pros**: Prioritizes cheap/high-confidence expansions first. Speculative expansion only happens when confident interpretations fail.
**Cons**: Requires expanders to self-classify. Tier assignment may be subjective.

### Mode 4: Adaptive with Backpressure

Verify results feed back into expansion. If a high-confidence candidate fails, we learn something (e.g. "this host returned 404") and use that to inform further expansion (e.g. "try other forges with the same path").

```
expand: hostPath → https://mary.my.id/atcute
verify: 404
learn: mary.my.id is not a git host
adapt: try path /atcute on known forges → [https://tangled.org/mary.my.id/atcute, ...]
verify: tangled.org → success → yield
```

**Pros**: Most intelligent. Minimizes wasted probes. Learns from failures.
**Cons**: Most complex. Requires feedback loop between expand and verify. Hard to implement cleanly.

## Recommendation

The immediate fix is Mode 1 — remove the mutual exclusion guard from shorthandExpander so it also produces candidates for dotted inputs. This is a small change that leverages the existing architecture as designed. The existing `verify()` already handles multiple candidates and skips failures.

For `mary.my.id/atcute` specifically, adding `"tangled.org"` to `defaultHosts` would make shorthand produce `https://tangled.org/mary.my.id/atcute`, which would resolve successfully. The hostPath candidate `https://mary.my.id/atcute` would fail verification and be skipped.

Mode 2 (round-robin) is the natural next evolution if the candidate space grows large and we want to control probe costs. It requires changing the Expander interface from `expand(): URL[]` to something like `expand(input: string): AsyncIterable<URL>` or `expand(input: string, depth: number): URL[]`.
