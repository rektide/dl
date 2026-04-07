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

## Placement in the `dl` Pipeline

```
dl/index.ts  processRepoContext()
  |
  +-- syncArchive()        // clone/update to ~/archive/<org>/<repo>
  +-- syncSimplify()  <--  NEW: create simplified symlinks
  +-- syncWiki()           // clone/update wiki
```

`syncSimplify` runs **after** `syncArchive` (so the real directory exists) and
**before** `syncWiki` (so wiki paths also benefit from the symlinks in the org layer).

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

## Integration with `DlOptions`

No new CLI flags needed. Symlink creation is always attempted when `doArchive` is true
(the symlinks live in the archive tree). The `dryRun` flag is respected: log what would
be symlinked without creating anything.

## What About `~/wiki/`?

Same org-level simplification applies. After `syncWiki`, create
`~/wiki/<simplifiedOrg> -> <org>` if needed. Repo-level wiki paths follow the same
pattern. This can be a follow-up or done in the same pass by passing `wikiRoot` into
`syncSimplify`.

## Existing Ad-Hoc Symlinks

These would become redundant once the feature is active:

- `~/archive/mooncake -> Mooncake-Labs`
- `~/archive/tanstack -> TanStack`

They can be left in place (idempotent) or cleaned up manually.

## Open Questions

1. **Should we also simplify inside `~/wiki/` in the initial implementation, or only `~/archive/`?**
2. **Should `syncSimplify` be a separate step or folded into `syncArchive`?**
3. **For repo-level symlinks, should the org symlink target be the original org dir or the simplified one?** (Currently proposed: original org dir, so `~/archive/effectts/MSEdgeExplainers` is not a thing — it would be `~/archive/effectts/msedgeexplainers -> ../../MicrosoftEdge/MSEdgeExplainers` using a relative path through the org symlink.)
4. **Should we scan and backfill symlinks for all existing archive entries, or only create them going forward?** A separate `rekon simplify` command could handle the backfill.
