# Gunshi Plugins in Rekon

Rekon uses [gunshi](https://github.com/kazupon/gunshi) plugins to decompose command logic into reusable, injectable capabilities. This document describes the current plugin architecture and each plugin's role.

## Plugin Architecture Overview

Plugins are defined in [`src/plugin/`](/src/plugin/) and provide domain capabilities to commands via gunshi's extension system. Commands declare dependencies on plugins and access their functionality through the command context.

```
src/plugin/
├── roots.ts    # Destination directory resolution
├── repo.ts     # Repository URL parsing/resolution  
├── git.ts      # Git operations abstraction
└── dexport.ts  # Wiki scraping (deepwiki)
```

## Plugin Registration

Plugins are registered when calling `cli()` in a command. Example from [`src/command/dl.ts`](/src/command/dl.ts):

```typescript
await cli(process.argv.slice(2), module.default, {
  name: DL_COMMAND_NAME,
  plugins: [
    c12({ name: "rekon" }),
    createRootsPlugin(),
    createRepoPlugin(),
    createGitPlugin(),
    createDexportPlugin(),
  ],
})
```

## Plugin Details

### roots (`rekon:roots`)

**File:** [`src/plugin/roots.ts`](/src/plugin/roots.ts)

Resolves destination directory roots for archive and wiki storage.

| Method | Returns | Description |
|--------|---------|-------------|
| `resolveRoots()` | `Promise<{ archiveRoot, wikiRoot }>` | Resolves `~/archive` and `~/wiki` paths |

Resolution order:
1. Environment variables (`ARCHIVE_DIR`, `WIKI_DIR`)
2. c12 config file values
3. Defaults (`~/archive`, `~/wiki`)

This plugin depends on the c12 plugin being registered first to access config.

---

### repo (`rekon:repo`)

**File:** [`src/plugin/repo.ts`](/src/plugin/repo.ts)

Parses and resolves repository URLs/identifiers to structured context.

| Method | Returns | Description |
|--------|---------|-------------|
| `parse(input)` | `ParsedInput` | Parses URL into `{ host, path, segments }` |
| `resolve(input)` | `Promise<RepoContext>` | Full resolution with validation |

Supports multiple input formats:
- Full URLs: `https://github.com/org/repo`, `git@github.com:org/repo`
- Short form: `org/repo` (defaults to GitHub)
- Host/path: `gitlab.com/org/group/repo`

Provider-specific handling for:
- **GitHub**: API validation, 2-segment paths
- **GitLab**: API validation, nested group paths
- **Tangled**: Special domain handling
- **Generic**: HEAD request validation

Returns `RepoContext` with clone URLs, namespace path, org/repo names, and deepwiki URL.

---

### git (`rekon:git`)

**File:** [`src/plugin/git.ts`](/src/plugin/git.ts)

Abstracts git operations for repository management.

| Method | Description |
|--------|-------------|
| `cloneOrUpdate(url, path, options)` | Clone new or update existing repository |
| `ensureJjInitialized(path)` | Initialize jujutsu in repository if needed |
| `listRemotes(path)` | List configured remotes |
| `normalizeCloneUrl(url)` | Normalize URL for comparison |

Wraps [`src/git/`](/src/git/) implementations, providing a stable interface for commands that need git operations without direct coupling to implementation details.

---

### dexport (`rekon:dexport`)

**File:** [`src/plugin/dexport.ts`](/src/plugin/dexport.ts)

Provides wiki scraping capability via deepwiki integration.

| Method | Description |
|--------|-------------|
| `sync(org, repo, wikiRoot, options)` | Sync wiki content from deepwiki |

Wraps [`src/dexport/`](/src/dexport/) which handles:
- Spawning dexport process for wiki scraping
- Progress output consumption
- Detached vs attached execution modes

---

## Using Plugins in Commands

Commands access plugins through the context's `extensions` object:

```typescript
interface DlCommandContext extends LinkContext {
  extensions?: LinkContext["extensions"] & {
    [ROOTS_PLUGIN_ID]?: RootsExtension
    [REPO_PLUGIN_ID]?: RepoExtension
    [GIT_PLUGIN_ID]?: GitExtension
    [DEXPORT_PLUGIN_ID]?: DexportExtension
  }
}

async function run(ctx?: DlCommandContext) {
  const rootsExtension = ctx?.extensions?.[ROOTS_PLUGIN_ID]
  const repoExtension = ctx?.extensions?.[REPO_PLUGIN_ID]
  // ...
  const roots = await rootsExtension.resolveRoots()
  const repoContext = await repoExtension.resolve(input)
}
```

## Plugin Creation Pattern

Each plugin follows the same structure:

```typescript
import { plugin } from "gunshi/plugin"

export const PLUGIN_ID = "rekon:plugin-name" as const

export interface PluginExtension {
  // Methods exposed to commands
}

export function createPlugin() {
  return plugin({
    id: PLUGIN_ID,
    name: "Plugin Name",
    extension: (ctx): PluginExtension => ({
      // Return implementation
    }),
  })
}
```

## Future Work

Open beads tickets track further decomposition:

| Ticket | Goal |
|--------|------|
| `rekon-gunshi-domain-split` | Split dl into archive/wiki domain modules |
| `rekon-gunshi-roots-repo-plugin` | Enhance roots/repo plugins |
| `rekon-gunshi-capability-plugins` | Add archive/wiki/archlist plugins |
| `rekon-gunshi-thin-command-wiring` | Normalize commands to thin orchestration |

See [`doc/discovery/gunshi-decomposition.md`](/doc/discovery/gunshi-decomposition.md) for the full decomposition plan.
