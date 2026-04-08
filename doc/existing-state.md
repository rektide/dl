# Existing-Resource State Flags

Related: [rekon-consolidate-plugin-lifecycle](/.beads/issues.jsonl) (shared plugin lifecycle hooks), [rekon-existing-state](/.beads/issues.jsonl) (this work)

## Problem

When `rekon dl morrownr/USB-WIFI` targets a repo that already has checkout(s) on disk, each pipeline step reacts differently and inconsistently. Some steps silently skip, some always re-run (even pointlessly), and there are no flags to control per-step behavior. Additionally, if any step throws, subsequent steps are skipped entirely.

## Current Behavior Trace: `morrownr/USB-WIFI` already exists

```
~/archive/morrownr/USB-WIFI/.git exists
~/archive/morrownr/USB-WIFI/.jj exists
~/wiki/morrownr/USB-WIFI/ exists (dexport content)
```

| Step | Code path | Current behavior | Freshen? |
|------|-----------|-----------------|----------|
| archlist | [`processRepoContext`](/src/dl/index.ts) → `appendFile(archlistPath, url)` | **Always appends** — creates duplicate lines in `~/archlist` | No |
| archive | [`syncArchive`](/src/archive/sync.ts) → [`cloneOrUpdate`](/src/git/clone.ts) | `.git` exists → `git pull --ff-only` | Yes |
| jj init | [`syncArchive`](/src/archive/sync.ts) → [`ensureJjInitialized`](/src/git/jj.ts) | `.jj` exists → return | N/A |
| simplify | [`syncSimplify`](/src/simplify/index.ts) → [`ensureSymlink`](/src/simplify/index.ts) | Symlink exists & correct → `"already_linked"` | N/A |
| dexport | [`syncWiki`](/src/wiki/sync.ts) → [`chooseDexportPlan`](/src/dexport/policy.ts) | Directory exists → `"skip-existing"` | **No** |
| git wiki | [`syncGitWiki`](/src/wiki/git.ts) → [`cloneOrUpdate`](/src/git/clone.ts) | `.git` exists → `git pull --ff-only` | Yes |

### Three problems

1. **archlist duplicates**: unconditionally appends, even if URL already listed
2. **dexport stale**: once `~/wiki/<org>/<repo>/` exists, dexport never re-runs — stale/missing content stays stale
3. **cascading failure**: `processRepoContext` runs steps sequentially without try-catch per step; if archive throws, simplify and wiki never execute

## First move: common lifecycle reporting path

Before changing the state-machine flags, establish one reporting path that every step uses. That gives us a stable way to inspect transitions and state evidence while refactoring behavior.

### Lifecycle record schema

| Field | Meaning | Example |
|-------|---------|---------|
| `step` | Canonical step/sub-step id | `archive`, `archive-jj`, `wiki-dexport` |
| `source` | Code path producing the record | `syncArchive -> git.cloneOrUpdate` |
| `status` | Normalized outcome | `ok`, `skipped`, `failed`, `needs-attention` |
| `transition` | Concrete action taken | `cloned`, `updated`, `already_initialized`, `branched_preserved`, `fetched` |
| `details` | Step-specific evidence payload | `{ destination, reason, message, plan }` |

### Current transition signal producers

| Transition source | File | Signal values |
|-------------------|------|---------------|
| archive clone/update | [`src/git/clone.ts`](/src/git/clone.ts) | `cloned`, `updated` |
| archive jj init | [`src/git/jj.ts`](/src/git/jj.ts) | `initialized`, `already_initialized` |
| simplify link creation | [`src/simplify/index.ts`](/src/simplify/index.ts) | `created`, `already_linked`, `conflict_symlink`, `conflict_exists`, `skip_same` |
| dexport decision + run | [`src/dexport/policy.ts`](/src/dexport/policy.ts), [`src/dexport/sync.ts`](/src/dexport/sync.ts) | `skip-existing`, `queue`, `run` → `skipped`, `queued`, `ran`, `failed` |
| git wiki clone/update | [`src/wiki/git.ts`](/src/wiki/git.ts) | `cloned`, `updated`, `failed` |

### Report table shape by pipeline aspect

| Aspect | Steps | Primary transitions |
|--------|-------|---------------------|
| archlist | `archlist` | `appended`, `already_present`, `off`, `error` |
| archive checkout | `archive` | `cloned`, `updated`, `fetched`, `branched_preserved`, `off`, `error` |
| archive jj | `archive-jj` | `initialized`, `already_initialized`, `off` |
| simplify links | `simplify-org`, `simplify-repo` | `created`, `already_linked`, `conflict_*`, `skip_same`, `off`, `error` |
| wiki/dexport | `wiki-dexport` | `skipped`, `queued`, `ran`, `failed`, `off` |
| wiki git | `wiki-git` | `cloned`, `updated`, `failed`, `not-applicable`, `off` |

This reporting layer gives us a single contract for "what happened" before introducing state behavior changes.

## Proposal: `=state` parameter on each verb flag

Replace boolean flags (`--archive`, `--wiki`, `--archlist`, `--simplify`) with enumerated state flags:

```
--archive=<state>     default: ensure
--wiki=<state>        default: ensure
--archlist=<state>    default: ensure
--simplify=<state>    default: ensure
```

### State ordering (most active → most inert)

States are listed in descending order of invasiveness. Each step's table follows this order.

| State | Meaning | Scope |
|-------|---------|-------|
| `force` | Recreate target from scratch, preserving in-flight work | All steps |
| **`ensure`** | **Default.** Create if missing, update/refresh if present | All steps |
| `fetch` | Fetch remote refs without merging/checkout | Archive, wiki-git |
| `skip` | Only act if target doesn't exist; no-op otherwise | All steps |
| `check` | Report current state without making changes | All steps |
| `off` | Skip this step entirely | All steps |

### Per-step state semantics

#### `--archive=<state>`

| State | Behavior |
|-------|----------|
| `force` | If conflicting local changes exist, create `preserved-<timestamp>` branch with those changes. Then `rm -rf` destination, fresh `git clone` + `jj git init`. Emits `branched_preserved` if work was saved. |
| **`ensure`** | **Clone if missing. If present: `git pull --ff-only` + ensure jj.** Default. |
| `fetch` | `git fetch` all remotes without merging. Repo stays on whatever branch/commit it's on. Useful for offline-ready mirror without changing working tree. Emits `fetched`. |
| `skip` | Only clone if no `.git` dir exists; otherwise no-op |
| `check` | Report: does `.git` exist? `.jj` exist? current branch? uncommitted changes? upstream divergence? Emit structured status without mutating anything. |
| `off` | Don't touch archive checkout |

#### `--wiki=<state>`

| State | Behavior |
|-------|----------|
| `force` | `rm -rf` wiki destination, fresh dexport run + fresh git wiki clone |
| **`ensure`** | **Re-run dexport even if wiki dir exists + `git pull --ff-only` on git wiki.** Freshens stale dexport content. Default. |
| `fetch` | `git fetch` on git wiki without merging. Dexport not re-run. |
| `skip` | Only run dexport + git wiki clone if wiki dir doesn't exist |
| `check` | Report: does wiki dir exist? dexport content present? git wiki `.git` exist? last sync time? |
| `off` | Don't touch wiki |

#### `--archlist=<state>`

| State | Behavior |
|-------|----------|
| `force` | Append URL unconditionally (current default behavior) |
| **`ensure`** | **Append only if URL not already in `~/archlist`.** Deduplicated. Default. |
| `fetch` | N/A — no fetch concept for a line file |
| `skip` | Append only if URL not already in `~/archlist` (same as ensure for this step) |
| `check` | Report: is URL already present in `~/archlist`? total line count? |
| `off` | Don't touch `~/archlist` |

#### `--simplify=<state>`

| State | Behavior |
|-------|----------|
| `force` | Remove conflicting entries, recreate symlinks |
| **`ensure`** | **Create missing symlinks, warn on conflicts.** Default. |
| `fetch` | N/A — no fetch concept for symlinks |
| `skip` | Only create symlinks that don't exist yet |
| `check` | Report: org symlink present? correct target? repo symlink present? correct target? any conflicts? |
| `off` | Don't create/check symlinks |

### Dexport sub-behavior under wiki state

The [`chooseDexportPlan`](/src/dexport/policy.ts) function currently returns `"skip-existing"` when the wiki dir exists. Under the new model it takes the wiki `StepControl`:

| wiki state | dexport plan |
|------------|-------------|
| `off` | n/a |
| `skip` | `skip-existing` if dir present, else `run`/`queue` |
| `ensure` | always `run`/`queue` (re-runs dexport, which handles its own idempotency) |
| `force` | delete wiki dir, then `run`/`queue` |
| `fetch` | `skip-existing` (fetch is git-wiki only, dexport not invoked) |
| `check` | report dexport content status without running |

## Error isolation

Wrap each step in `processRepoContext` in its own try-catch so failure in one step does not prevent others from running:

```typescript
const errors: Error[] = []

if (ctx.options.doArchive.state !== "off") {
    try {
        await syncArchive(resolved, ctx, gitOps)
    } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)))
        ctx.log.error("sync", "archive_failed", { message: errors.at(-1)!.message })
    }
}

if (ctx.options.doSimplify.state !== "off") {
    try {
        await syncSimplify(resolved, ctx)
    } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)))
        ctx.log.error("sync", "simplify_failed", { message: errors.at(-1)!.message })
    }
}

if (ctx.options.doWiki.state !== "off") {
    try {
        await syncWiki(resolved, ctx, gitOps, dexportOps)
    } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)))
        ctx.log.error("sync", "wiki_failed", { message: errors.at(-1)!.message })
    }
}

return errors.length > 0
```

## Type changes

### `DlOptions`

```typescript
export type StepState = "force" | "ensure" | "fetch" | "skip" | "check" | "off"

export interface StepControl {
    state: StepState
}

export interface DlOptions {
    consumeDexportOutput: boolean
    noLogCache: boolean
    doArchive: StepControl
    doWiki: StepControl
    doArchlist: StepControl
    doSimplify: StepControl
    expand: boolean
    dryRun: boolean
}
```

### `args.ts` parsing

Parse `--archive=ensure`, `--wiki=off`, etc. When bare flag is given without `=` (e.g. `--archive`), treat as `--archive=ensure` for backward compatibility. `--no-archive` maps to `--archive=off`.

```typescript
const VALID_STATES = ["force", "ensure", "fetch", "skip", "check", "off"] as const

function parseStepState(token: string, flagName: string): StepControl | undefined {
    const prefix = `--${flagName}`
    const noPrefix = `--no-${flagName}`

    if (token === noPrefix) return { state: "off" }
    if (token === prefix) return { state: "ensure" }
    if (token.startsWith(`${prefix}=`)) {
        const value = token.slice(prefix.length + 1)
        if ((VALID_STATES as readonly string[]).includes(value)) {
            return { state: value as StepState }
        }
        throw new Error(`invalid --${flagName} state: ${value} (valid: ${VALID_STATES.join(", ")})`)
    }
    return undefined
}
```

### Guard predicate

Replace `if (ctx.options.doArchive)` with `if (ctx.options.doArchive.state !== "off")`.

Each sync function receives the `StepControl` so it can switch on `.state` for the full range of behaviors.

## Backward compatibility

| Old invocation | New equivalent |
|----------------|---------------|
| `--archive` | `--archive=ensure` |
| `--no-archive` | `--archive=off` |
| (no flag, default) | all steps `ensure` |
| `--archive --no-wiki` | `--archive=ensure --wiki=off` |

## Pipeline flow

```
processRepoContext(resolved, ctx)
│
├─ archlist ──── off: skip · check: report presence · skip/ensure: append-if-absent · force: append always
│
├─ archive ───── off: skip · check: report git/jj state · skip: clone-if-missing
│                ensure: clone-or-pull · fetch: git-fetch-no-merge · force: preserve-branch + rm + clone
│   └─ jj init ── idempotent guard (follows archive state; re-inits on force)
│
├─ simplify ──── off: skip · check: report link state · skip: create-if-missing
│                ensure: create-or-warn · force: replace-conflicts
│
└─ wiki ──────── off: skip · check: report wiki state · skip: create-if-missing
                 ensure: re-run-dexport + pull-git-wiki · fetch: fetch-git-wiki-only
                 force: rm + fresh dexport + fresh git wiki clone
    ├─ dexport ── respects wiki state: skip/force/check pass through
    └─ git wiki ─ clone/pull/fetch following wiki state
```

## Example invocations

```bash
# default: ensure everything
rekon dl morrownr/USB-WIFI

# check what state everything is in (no mutations)
rekon dl --archive=check --wiki=check --archlist=check --simplify=check morrownr/USB-WIFI

# freshen archive, skip wiki/dexport
rekon dl --wiki=off morrownr/USB-WIFI

# fetch refs only — don't merge or change working tree
rekon dl --archive=fetch --wiki=off --archlist=off --simplify=off morrownr/USB-WIFI

# force re-clone archive only (preserves any local work to a branch)
rekon dl --archive=force --wiki=off --archlist=off --simplify=off morrownr/USB-WIFI

# re-run dexport on existing wiki content
rekon dl --archive=off --wiki=ensure --archlist=off --simplify=off morrownr/USB-WIFI

# only create what's missing
rekon dl --archive=skip --wiki=skip --archlist=skip --simplify=skip morrownr/USB-WIFI

# nuke and pave everything
rekon dl --archive=force --wiki=force --simplify=force morrownr/USB-WIFI
```

## Transition matrix

Decision reference: from observed resource state + configured step state, what happens.

### Resource observations

| Observation | Values | Source |
|-------------|--------|--------|
| `archive.git` | `exists` / `missing` / `unknown` | destination `.git` existence |
| `archive.jj` | `exists` / `missing` / `unknown` | destination `.jj` existence |
| `archive.dirty` | `clean` / `dirty` / `unknown` | `git status --porcelain` |
| `wiki.dir` | `exists` / `missing` / `unknown` | wiki destination dir check |
| `wiki.git` | `exists` / `missing` / `unknown` | wiki `.git` existence |
| `archlist.contains(url)` | `present` / `absent` / `unknown` | membership check in `~/archlist` |
| `simplify.link` | `correct` / `missing` / `conflict` / `unknown` | symlink precheck |

### Step run decisions

| Step | `off` | `check` | `skip` | **`ensure`** | `fetch` | `force` |
|------|-------|---------|--------|---------------|---------|---------|
| `archlist` | skip | report presence | append if absent | append if absent | — | append always |
| `archive` | skip | report git/jj/dirty | clone if no `.git` | clone or pull | `git fetch` only | preserve-branch → rm → clone |
| `archive-jj` | skip | report `.jj` | init if no `.jj` | init if no `.jj` | no-op | re-init after force |
| `simplify` | skip | report link state | create if missing | create or warn | — | replace conflicts |
| `wiki-dexport` | skip | report content | run if no wiki dir | run always | skip | rm → run |
| `wiki-git` | skip | report `.git` | clone if no `.git` | clone or pull | `git fetch` only | rm → clone |

### Invariant rules

1. **State precedence**: `off` always suppresses execution, regardless of observed state.
2. **Force work preservation**: `force` on archive must save conflicting local changes to a `preserved-<timestamp>` branch before deleting.
3. **Unknown safety**: for `skip` and `ensure`, unknown observations are treated as run-eligible.
4. **Force determinism**: `force` must produce a fully recreated target, not a partial update.
5. **Isolated failure**: one step failure cannot prevent independent steps from evaluating.
6. **Report completeness**: every step must emit exactly one terminal lifecycle status (`ok`/`skipped`/`failed`/`needs-attention`).
7. **Check purity**: `check` must never mutate filesystem state. It only emits lifecycle records with `status: needs-attention` or `status: ok`.

## Implementation order

1. Define and implement common lifecycle reporting path — new module `src/dl/lifecycle.ts` with normalized record emission
2. Wire lifecycle records into existing steps without changing behavior (baseline reporting)
3. Add `StepState` and `StepControl` types to `src/dl/types.ts`
4. Update `args.ts` to parse `=state` syntax with backward-compatible bare flags
5. Update `processRepoContext` with per-step error isolation + state guards
6. Thread `StepControl` into `syncArchive`, `syncSimplify`, `syncWiki`, `chooseDexportPlan`
7. Implement `check` state for each step (read-only status reporting)
8. Implement `fetch` state for archive and wiki-git
9. Implement `force` with work-preserving branch behavior for archive
10. Fix `chooseDexportPlan` to accept `StepControl` instead of only checking directory existence
