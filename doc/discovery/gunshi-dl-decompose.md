# Gunshi DL Decompose - Discovery Document

Assess how we can rebuild `dl` to use gunshi. Goal: lightweight commands in `src/command/` with domain-model grouped directories (archive/, wiki/) whose capabilities become `src/plugin/` gunshi plugins used by commands.

## Overview

The current `dl` command in [`src/command/dl.ts`](/home/rektide/src/rekon/src/command/dl.ts) is ~520 lines with multiple responsibilities:
- Repository URL parsing and resolution
- Git clone/update operations
- Archive management
- Wiki management (via dexport or git wiki)
- Project linking (symlinks between archive and wiki)

This document explores decomposing these into domain-specific plugins.

---

# Journal - Current DL Architecture

Started by reading the current [`dl.ts`](/home/rektide/src/rekon/src/command/dl.ts) implementation.

**Current responsibilities identified:**

1. **Argument parsing** - `parseArgs()` extracts flags from argv
2. **Repository resolution** - `parseRepositoryInput()`, `resolveRepository()`, `validateRepositoryPath()`
3. **Git operations** - `cloneOrUpdate()`, `runCommand()`, `runDetached()`
4. **JJ initialization** - `trackMainBookmark()` for jujutsu support
5. **Archive operations** - Clone/update to archive directory
6. **Wiki operations** - Either via dexport (for GitHub) or git wiki clone
7. **Project linking** - Calls [`linkSpecificProject()`](/home/rektide/src/rekon/src/repo/link.ts:327)

**Current file structure:**
```
src/
├── command/
│   ├── combine.ts
│   ├── dl.ts          # ~520 lines, monolithic
│   ├── install-commands.ts
│   ├── interpolate.ts
│   ├── project-files.ts
│   └── project-link.ts
└── repo/
    └── link.ts        # Symlink management
```

---

# Journal - Gunshi Plugin System

Explored the gunshi plugin system via the agent task.

**Key plugin concepts:**

1. **Plugin Definition** - Use `plugin()` from `gunshi/plugin`:
```typescript
import { plugin } from 'gunshi/plugin'

const myPlugin = plugin({
  id: 'my-plugin',
  name: 'My Plugin',
  setup: (ctx) => {
    // Add global options, commands, decorators
  },
  extension: (ctx, cmd) => {
    // Return object exposed via ctx.extensions.my-plugin
  }
})
```

2. **Lazy Commands** - Use `lazy()` for on-demand loading:
```typescript
import { lazy } from 'gunshi'

const buildCommand = lazy(() => import('./commands/build.ts'))
```

3. **Extensions** - Plugins expose capabilities via `ctx.extensions`:
```typescript
// In command:
const archive = ctx.extensions.archive
await archive.clone(url, destination)
```

4. **Plugin Context** - `PluginContext` provides:
   - `addGlobalOption()` - Add CLI options available to all commands
   - `addCommand()` - Register sub-commands
   - `decorateCommand()` - Wrap command execution (middleware pattern)
   - `decorateHeaderRenderer()`, `decorateUsageRenderer()` - Customize help

---

# Journal - Proposed Decomposition

Based on the `dl` command analysis, propose these domain plugins:

## Plugin: `archive`

**Responsibility:** Git clone/update operations to archive directory

**Location:** `src/plugin/archive.ts`

**Extension API:**
```typescript
interface ArchiveExtension {
  cloneOrUpdate(remoteUrl: string, destination: string): Promise<void>
  resolveDestinationRoot(): Promise<string>
  initJujutsu(destination: string): Promise<void>
}
```

**Capabilities extracted from dl.ts:**
- `cloneOrUpdate()` (lines 339-358)
- `trackMainBookmark()` (lines 92-94)
- Archive root resolution from `resolveDestinationRoots()`

## Plugin: `wiki`

**Responsibility:** Wiki fetch via dexport or git wiki

**Location:** `src/plugin/wiki.ts`

**Extension API:**
```typescript
interface WikiExtension {
  fetchWiki(options: {
    host: string
    namespacePath: string
    org: string
    repo: string
    destination: string
    consumeDexportOutput?: boolean
  }): Promise<void>
  resolveDestinationRoot(): Promise<string>
}
```

**Capabilities:**
- dexport invocation (lines 391-428)
- Git wiki clone (lines 429-437)
- Wiki root resolution

## Plugin: `repository`

**Responsibility:** Parse and resolve repository URLs

**Location:** `src/plugin/repository.ts`

**Extension API:**
```typescript
interface RepositoryExtension {
  parse(input: string): ParsedRepositoryInput
  resolve(input: string): Promise<ResolvedRepo>
  validatePath(host: string, repoPath: string): Promise<string | null>
}
```

**Capabilities:**
- `parseRepositoryInput()` (lines 183-243)
- `resolveRepository()` (lines 303-337)
- `validateRepositoryPath()` (lines 245-301)

## Plugin: `link`

**Responsibility:** Symlink management between archive and wiki

**Location:** `src/plugin/link.ts`

**Extension API:**
```typescript
interface LinkExtension {
  linkSpecificProject(options: {
    archiveRoot: string
    wikiRoot: string
    namespacePath: string
    onEvent?: LinkEventHandler
  }): Promise<boolean>
  discoverProjects(rootPath: string): Promise<ProjectEntry[]>
}
```

---

# Journal - Proposed File Structure

```
src/
├── command/
│   ├── combine.ts
│   ├── dl.ts              # Thin command, uses plugins
│   ├── install-commands.ts
│   ├── interpolate.ts
│   ├── project-files.ts
│   └── project-link.ts
├── plugin/
│   ├── archive.ts         # Archive plugin + extension
│   ├── wiki.ts            # Wiki plugin + extension
│   ├── repository.ts      # Repository parsing plugin
│   └── link.ts            # Symlink plugin
├── archive/
│   ├── clone.ts           # Git clone/update logic
│   └── jujutsu.ts         # JJ initialization
├── wiki/
│   ├── dexport.ts         # Dexport integration
│   └── git-wiki.ts        # Git wiki clone
├── repository/
│   ├── parse.ts           # URL parsing
│   ├── resolve.ts         # Host resolution
│   └── validate.ts        # API validation
└── repo/
    └── link.ts            # Existing symlink logic
```

---

# Journal - Lazy Command Pattern

All gunshi commands should use lazy loading for consistency.

**Current approach in [`rekon.ts`](/home/rektide/src/rekon/rekon.ts):**
```typescript
import dlCommand from './src/command/dl.ts'  // Eager import

subCommands: {
  dl: dlCommand,
}
```

**Lazy approach:**
```typescript
import { lazy } from 'gunshi'

subCommands: {
  dl: lazy(() => import('./src/command/dl.ts')),
}
```

This loads the command module only when `rekon dl` is invoked.

---

# Decisions Made

## 1. Repository Identity Plugin ✓ ACCEPTED

A `repo` plugin that handles repository identity for both `dl` and `dexport`:
- Parses shorthand (`org/repo`) and full URLs
- Resolves to canonical host (github.com, gitlab.com)
- Provides host transformation (github.com → deepwiki.com)
- Caches validation results

**Extension API:**
```typescript
interface RepoExtension {
  parse(input: string): ParsedRepositoryInput
  resolve(input: string): Promise<ResolvedRepo>
  transformHost(url: URL, newHost: string): URL
  toDeepwikiUrl(org: string, repo: string): URL
}
```

## 2. Plugin Factory Pattern ✓ ACCEPTED

Use `createPlugin(options): PluginWithExtension<T>` pattern (as seen in [gunsho11y](/home/rektide/src/gunsho11y/src/plugin.ts)):

```typescript
// src/plugin/repo.ts
export function createRepoPlugin(options: RepoPluginOptions = {}): PluginWithExtension<RepoExtension> {
  return plugin({
    id: 'repo',
    extension: (ctx, cmd) => {
      return {
        parse(input) { /* ... */ },
        resolve(input) { /* ... */ },
        // ...
      }
    }
  })
}

export type { RepoPluginOptions, RepoExtension }
```

**Benefits:**
- Configuration at registration time
- Exports both plugin and extension types
- Symmetric design across all plugins
- Reusable, testable plugins

## 3. Global Plugin Registration ✓ ACCEPTED

Register shared plugins globally in [`rekon.ts`](/home/rektide/src/rekon/rekon.ts):

```typescript
await cli(process.argv.slice(2), mainCommand, {
  plugins: [
    createRepoPlugin(),      // Used by dl, dexport
    createArchivePlugin(),   // Used by dl
    createWikiPlugin(),      // Used by dl
    createScraperPlugin(),   // Used by dexport
  ],
  subCommands: {
    dl: lazy(() => import('./src/command/dl.ts')),
    dexport: lazy(() => import('./src/command/dexport.ts')),
  }
})
```

**Principle:** Plugins should be lazy - they shouldn't do work unless their extension is used. Global registration is fine because the extension factory only runs when a command accesses `ctx.extensions.repo`.

## 4. Domain Module Separation

Keep domain logic in dedicated directories as pure functions:
- `src/repo/` - Repository parsing, resolution logic
- `src/archive/` - Clone/update, jujutsu init
- `src/wiki/` - Wiki fetch, scraper integration
- `src/scraper/` - HTML scraping, downloading

Plugins wrap domain modules and expose via extension API.

---

# Journal - dexport Integration Planning

See [`dexport-integrate.md`](/home/rektide/src/rekon/doc/discovery/dexport-integrate.md) for the integration plan.

---

# Discussion Questions (Resolved)

1. ~~Should plugins be registered globally or per-command?~~ → **Global**
2. ~~Plugin factory pattern?~~ → **Use `createPlugin()` factory**
3. ~~Repository plugin scope?~~ → **Global, shared by dl and dexport**

---

# Open Questions

1. **Dexport integration model** - subprocess vs module import vs shared plugin?
2. **Repository merge strategy** - how to merge ~/src/dexport into ~/src/rekon?

---

# Next Steps

1. Create `src/plugin/repo.ts` using factory pattern
2. Extract repo parsing logic to `src/repo/` domain modules
3. Convert `dl.ts` to use repo plugin extension
4. Create `src/plugin/archive.ts` and `src/plugin/wiki.ts`
5. Convert all commands to lazy loading
6. Integrate dexport (see dexport-integrate.md)
