# Existing-Resource State Flags

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
| archlist | `processRepoContext` → `appendFile(archlistPath, url)` | **Always appends** — creates duplicate lines in `~/archlist` | No |
| archive | `syncArchive` → `cloneOrUpdate` | `.git` exists → `git pull --ff-only` | Yes |
| jj init | `syncArchive` → `ensureJjInitialized` | `.jj` exists → return | N/A |
| simplify | `syncSimplify` → `ensureSymlink` | Symlink exists & correct → `"already_linked"` | N/A |
| dexport | `syncWiki` → `chooseDexportPlan` | Directory exists → `"skip-existing"` | **No** |
| git wiki | `syncGitWiki` → `cloneOrUpdate` | `.git` exists → `git pull --ff-only` | Yes |

### Three problems

1. **archlist duplicates**: unconditionally appends, even if URL already listed
2. **dexport stale**: once `~/wiki/<org>/<repo>/` exists, dexport never re-runs — stale/missing content stays stale
3. **cascading failure**: `processRepoContext` runs steps sequentially without try-catch per step; if archive throws, simplify and wiki never execute

## First move: common lifecycle reporting path

Before changing the state-machine flags, establish one reporting path that every step uses. That gives us a stable way to inspect transitions and state evidence while refactoring behavior.

Implemented reporting path:

- [`src/dl/lifecycle.ts`](/src/dl/lifecycle.ts): shared lifecycle reporter + normalized record shape.
- [`src/dl/index.ts`](/src/dl/index.ts): per-step isolated execution and lifecycle record emission.
- `rekon dl --report-lifecycle`: emits a per-repo `lifecycle_report` event with all step records.

### Lifecycle record schema

| Field | Meaning | Example |
|-------|---------|---------|
| `step` | Canonical step/sub-step id | `archive`, `archive-jj`, `wiki-dexport` |
| `source` | Code path producing the record | `syncArchive -> git.cloneOrUpdate` |
| `status` | Normalized outcome | `ok`, `skipped`, `failed` |
| `transition` | Concrete state transition/action label | `cloned`, `updated`, `already_initialized`, `ran`, `off` |
| `details` | Step-specific evidence payload | `{ destination, reason, message, plan }` |

### Current transition signal producers (code-level)

| Transition source | File | Signal values |
|-------------------|------|---------------|
| archive clone/update | [`src/git/clone.ts`](/src/git/clone.ts) | `cloned`, `updated` |
| archive jj init | [`src/git/jj.ts`](/src/git/jj.ts) | `initialized`, `already_initialized` |
| simplify link creation | [`src/simplify/index.ts`](/src/simplify/index.ts) | `created`, `already_linked`, `conflict_*`, `skip_same` |
| dexport decision + run mode | [`src/dexport/policy.ts`](/src/dexport/policy.ts), [`src/dexport/sync.ts`](/src/dexport/sync.ts) | `skip-existing`, `queue`, `run` -> `skipped`, `queued`, `ran`, `failed` |
| git wiki clone/update | [`src/wiki/git.ts`](/src/wiki/git.ts) | `cloned`, `updated`, `failed` |
| pipeline step isolation | [`src/dl/index.ts`](/src/dl/index.ts) | `off`, `error`, `blocked`, `would-*` |

### Report table shape by pipeline aspect

| Aspect | Steps | Primary transitions |
|--------|-------|---------------------|
| archlist | `archlist` | `appended`, `off`, `would-append`, `error` |
| archive checkout | `archive` | `cloned`, `updated`, `off`, `would-sync`, `error` |
| archive jj | `archive-jj` | `initialized`, `already_initialized`, `off`, `would-ensure`, `blocked` |
| simplify links | `simplify-org`, `simplify-repo` | `created`, `already_linked`, `conflict_*`, `skip_same`, `off`, `error` |
| wiki/dexport | `wiki-dexport` | `skipped`, `queued`, `ran`, `failed`, `off`, `would-sync` |
| wiki git | `wiki-git` | `cloned`, `updated`, `failed`, `not-applicable`, `off`, `would-sync` |

This reporting layer gives us a single contract for "what happened" before introducing `off/skip/ensure/force` behavior changes.

## Proposal: `=state` parameter on each verb flag

Replace boolean flags (`--archive`, `--wiki`, `--archlist`, `--simplify`) with enumerated state flags:

```
--archive=<state>     default: ensure
--wiki=<state>        default: ensure
--archlist=<state>    default: ensure
--simplify=<state>    default: ensure
```

### States

| State | Meaning |
|-------|---------|
| `off` | Skip this step entirely |
| `skip` | Only run if target does not exist (no-op if present) |
| `ensure` | **Default.** Create if missing, update/refresh if present |
| `force` | Delete target and recreate from scratch |

### Per-step state semantics

#### `--archlist=<state>`

| State | Behavior |
|-------|----------|
| `off` | Don't touch `~/archlist` |
| `skip` | Append only if URL not already in `~/archlist` |
| `ensure` | Append only if URL not already in `~/archlist` (same as `skip` — no "update" concept for a line append) |
| `force` | Append unconditionally (current behavior) |

#### `--archive=<state>`

| State | Behavior |
|-------|----------|
| `off` | Don't touch archive checkout |
| `skip` | Only clone if no `.git` dir exists; otherwise no-op |
| `ensure` | Clone or `git pull --ff-only` + ensure jj (current default) |
| `force` | `rm -rf` destination, fresh `git clone` + `jj git init` |

#### `--simplify=<state>`

| State | Behavior |
|-------|----------|
| `off` | Don't create/check symlinks |
| `skip` | Only create symlinks that don't exist yet |
| `ensure` | Create missing symlinks, warn on conflicts (current default) |
| `force` | Remove conflicting entries, recreate symlinks |

#### `--wiki=<state>`

| State | Behavior |
|-------|----------|
| `off` | Don't touch wiki |
| `skip` | Only run dexport + git wiki clone if wiki dir doesn't exist |
| `ensure` | Re-run dexport even if wiki dir exists + `git pull --ff-only` on git wiki (new: freshens stale dexport content) |
| `force` | `rm -rf` wiki destination, fresh dexport run + fresh git wiki clone |

### Dexport sub-behavior

The `chooseDexportPlan` function currently returns `"skip-existing"` when the wiki dir exists. Under the new model:

| wiki state | dexport plan |
|------------|-------------|
| `off` | n/a |
| `skip` | `skip-existing` if dir present, else `run`/`queue` |
| `ensure` | always `run`/`queue` (re-runs dexport, which handles its own idempotency) |
| `force` | delete wiki dir, then `run`/`queue` |

## Error isolation

Wrap each step in `processRepoContext` in its own try-catch so that a failure in one step does not prevent others from running:

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
export type StepState = "off" | "skip" | "ensure" | "force"

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
function parseStepState(token: string, flagName: string): StepControl | undefined {
    const prefix = `--${flagName}`
    const noPrefix = `--no-${flagName}`

    if (token === noPrefix) return { state: "off" }
    if (token === prefix) return { state: "ensure" }
    if (token.startsWith(`${prefix}=`)) {
        const value = token.slice(prefix.length + 1)
        if (["off", "skip", "ensure", "force"].includes(value)) {
            return { state: value as StepState }
        }
        throw new Error(`invalid --${flagName} state: ${value}`)
    }
    return undefined
}
```

### Guard predicate

Replace `if (ctx.options.doArchive)` with `if (ctx.options.doArchive.state !== "off")`.

Each sync function receives the `StepControl` so it can switch on `.state` for skip/ensure/force behavior.

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
├─ archlist  ─── skip if "off", check duplicate if "skip"/"ensure", append always if "force"
│
├─ archive ───── skip if "off", clone-if-missing if "skip", clone-or-pull if "ensure", rm+clone if "force"
│   └─ jj init ── idempotent guard (skips if .jj exists; no force needed, follows archive force)
│
├─ simplify ──── skip if "off", create-if-missing if "skip", create-or-warn if "ensure", rm+create if "force"
│
└─ wiki ──────── skip if "off", clone-if-missing if "skip", re-run-dexport+pull if "ensure", rm+fresh if "force"
    ├─ dexport ── respects wiki state for skip-existing vs re-run decision
    └─ git wiki ─ clone-or-pull following archive pattern, respects wiki state
```

## Example invocations

```bash
# default: ensure everything
rekon dl morrownr/USB-WIFI

# freshen archive, skip wiki/dexport (fastest update)
rekon dl --wiki=off morrownr/USB-WIFI

# force re-clone archive only
rekon dl --archive=force --wiki=off --archlist=off --simplify=off morrownr/USB-WIFI

# re-run dexport on existing wiki content
rekon dl --archive=off --wiki=ensure --archlist=off --simplify=off morrownr/USB-WIFI

# only create what's missing
rekon dl --archive=skip --wiki=skip --archlist=skip --simplify=skip morrownr/USB-WIFI

# nuke and pave everything
rekon dl --archive=force --wiki=force --simplify=force morrownr/USB-WIFI
```

## Implementation order

1. Add common lifecycle reporting path and normalized transitions table emission
2. Add `StepState` and `StepControl` types to `src/dl/types.ts`
3. Update `args.ts` to parse `=state` syntax with backward-compatible bare flags
4. Update `processRepoContext` with per-step state guards (`off`/`skip`/`ensure`/`force`)
5. Thread `StepControl` into `syncArchive`, `syncSimplify`, `syncWiki`, `chooseDexportPlan`
6. Add force behavior (rm+clone/recreate) to each sync function
7. Fix `chooseDexportPlan` to accept state parameter instead of only checking directory existence
