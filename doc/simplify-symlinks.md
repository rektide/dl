# Simplified Symlinks for Archive Paths

## Problem

Archive paths like `~/archive/Effect-TS/effect` and `~/archive/Mooncake-Labs/duckdb_mooncake`
contain mixed-case, hyphens, underscores, and dots. These are cumbersome to tab-complete
and error-prone to type. We already have a handful of ad-hoc symlinks (e.g.
`~/archive/mooncake -> Mooncake-Labs`, `~/archive/tanstack -> TanStack`) but no
systematic mechanism.

## Goal

After `dl` syncs a repo to `~/archive/<org>/<repo>`, automatically create idempotent
symlinks at simplified names for both the org directory and the repo directory &mdash;
but only if the simplified name differs from the original and nothing (file, dir, or
symlink) already exists at that path.

## Simplification Rule

```
simplify(name) = name.toLowerCase().replace(/[^a-z0-9]/g, "")
```

Examples:

| Original | Simplified |
|---|---|
| `Effect-TS` | `effectts` |
| `Mooncake-Labs` | `mooncakelabs` |
| `MSEdgeExplainers` | `msedgeexplainers` |
| `duckdb_mooncake` | `duckdbmooncake` |
| `effect` | `effect` (no change) |

## Scope

Archive only. `~/wiki/` symlinks are a possible follow-up.

## Flag: same pattern as `--archlist`

In `args.ts`, `doArchive`, `doWiki`, and `doArchlist` are all independent
on-by-default booleans. When any are explicitly passed, only the flagged ones run.
`doSimplify` follows the exact same pattern:

```
// args.ts
let doSimplify = true

if (hasArchiveFlag || hasWikiFlag || hasArchlistFlag || hasSimplifyFlag) {
    doArchive = hasArchiveFlag
    doWiki = hasWikiFlag
    doArchlist = hasArchlistFlag
    doSimplify = hasSimplifyFlag
}
```

Add to `DlOptions`: `doSimplify: boolean` (default `true`).
Gunshi arg: `simplify: { type: "boolean", default: true }` — gives `--simplify` / `--no-simplify`.

`dryRun` is respected: log what would be symlinked without creating anything.

## Placement in `processRepoContext`

Same shape as the existing steps — a guarded block:

```typescript
if (ctx.options.doSimplify) {
    await syncSimplify(resolved, ctx)
}
```

Runs after `syncArchive` (so the real directory exists). Order within
`processRepoContext` mirrors the existing pattern:

```
processRepoContext()
  if (doArchlist)   append to archlist
  if (doArchive)    syncArchive()
  if (doSimplify)   syncSimplify()   <-- here
  if (doWiki)       syncWiki()
```

## New Module: `src/simplify/`

```
src/simplify/
  index.ts      // simplify() pure function, syncSimplify() side-effect
```

### `simplify(name: string): string`

Pure function. Lowercases and strips non-alphanumeric characters.

### `syncSimplify(resolved: RepoContext, ctx: DlContext): Promise<void>`

Given a resolved `RepoContext` with `url` set:

1. Extract `org` and `project` from the URL pathname.
2. Compute `simplify(org)`. If it differs from `org` and no entry exists at
   `<archiveRoot>/<simplifiedOrg>`, create a symlink `<simplifiedOrg> -> <org>`.
3. Compute `simplify(project)`. If it differs from `project` and no entry exists at
   `<archiveRoot>/<simplifiedOrg>/<simplifiedProject>`, create a symlink
   `<simplifiedProject> -> <project>`.

This is idempotent: if the symlink already points to the right target, it's a no-op.

## Edge Cases

| Case | Behavior |
|---|---|
| Simplified name == original (e.g. `effect`) | Skip, no symlink needed |
| Symlink already exists pointing to correct target | No-op |
| Symlink exists pointing elsewhere | Log warning, do NOT overwrite |
| Directory or file exists at simplified path | Log warning, do NOT touch |
| Org symlink needed but repo name is already simple | Still create org symlink |
| Same simplified name for two different orgs (collision) | First one wins, second logs warning |

## Existing Ad-Hoc Symlinks

These would become redundant once the feature is active:

- `~/archive/mooncake -> Mooncake-Labs`
- `~/archive/tanstack -> TanStack`

They can be left in place (idempotent) or cleaned up manually.

## Command: `rekon resimplify`

Standalone command for backfilling/refreshing symlinks on existing entries.

```
rekon resimplify                     # process current working directory
rekon resimplify ~/archive/Effect-TS # process given path(s)
rekon resimplify ~/archive/Effect-TS ~/archive/Mooncake-Labs
```

### Behavior

Given a path (defaults to `cwd`), figure out what it is relative to `archiveRoot`:

- **If it's an org directory**: for each repo inside, create a repo-level symlink
  if the simplified name differs. Also create the org-level symlink.
- **If it's a repo directory**: create both the org-level symlink and the
  repo-level symlink.
- **If it's neither** (not under `archiveRoot`): log warning, skip.

Respects `--dry-run`.

### Implementation

New command file `src/command/resimplify.ts`, reuses `simplify()` and the
core symlink logic from `src/simplify/`. No repo resolution needed — this
works purely on filesystem paths, not URLs.

## Open Questions

1. **For repo-level symlinks, should the symlink live under the simplified org or the original org?** i.e. `~/archive/effectts/msedgeexplainers -> ../../MicrosoftEdge/MSEdgeExplainers` (through the org symlink) vs `~/archive/MicrosoftEdge/msedgeexplainers -> MSEdgeExplainers` (under original org).
