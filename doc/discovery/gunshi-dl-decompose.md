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

# Decisions Made (continued)

## 5. Dexport Integration Model ✓ ACCEPTED

**Decision:** Use `scraper` plugin that does scraping work directly (module import).

- Plugin name: `scraper` (NOT `dexport`)
- Domain modules: `src/scraper/` (NOT `src/dexport/`)
- Command: `rekon dexport` (thin command using scraper plugin)
- Remove subprocess integration entirely
- See [`dexport-integrate.md`](/home/rektide/src/rekon/doc/discovery/dexport-integrate.md) for full plan

## 6. Merge Timing ✓ ACCEPTED

**Decision:** Merge repos first, then refactor.

1. Merge ~/src/dexport into ~/src/rekon (preserving all history)
2. Refactor merged code into plugins and domain modules
3. See [`repo-merge-plan.md`](/home/rektide/src/rekon/doc/discovery/repo-merge-plan.md) for merge strategy

**Status:** Do not merge yet - plan is ready, awaiting execution.

---

# Journal - Figments Configuration

*Exploring figments library for configuration management...*
## Exploration Summary

Explored the [`figments`](/home/rektide/src/figments) codebase:
- [`README.md`](/home/rektide/src/figments/README.md) - Overview and usage examples
- [`src/index.ts`](/home/rektide/src/figments/src/index.ts) - Main exports
- [`src/figment.ts`](/home/rektide/src/figments/src/figment.ts) - Core Figment class
- [`src/provider.ts`](/home/rektide/src/figments/src/provider.ts) - Provider interface
- [`src/providers/`](/home/rektide/src/figments/src/providers/) - Built-in providers (Env, Data, Serialized)
- [`src/core/`](/home/rektide/src/figments/src/core/) - Types, coalesce logic, metadata, path utilities

## Figments Capabilities

**Purpose:** TypeScript port of Rust `figment` library - configuration management with provider composition and conflict resolution.

### Core Concepts

1. **Figment** - Combiner class that aggregates configuration from multiple providers
2. **Provider** - Interface for configuration sources (files, env vars, serialized values)
3. **Profile** - Configuration namespaces: `default`, `global`, and custom profiles
4. **Metadata/Tags** - Provenance tracking (which provider contributed each value)

### Composition Strategies

| Strategy | On Conflict | Arrays |
|----------|-------------|--------|
| `join` | Keep existing | Keep existing |
| `merge` | Use incoming | Use incoming |
| `adjoin` | Keep existing | Concatenate |
| `admerge` | Use incoming | Concatenate |

### Built-in Providers

- **`Serialized`** - Inline/hardcoded values
- **`Env`** - Environment variables (with prefix, split, filter, map)
- **`Data`** (`Json`, `Toml`, `Yaml`) - File or string parsing

### Key Features

- Async file loading with parent directory search
- Deep nested config via dot notation (`server.host`)
- Provenance tracking (`findMetadata(path)`)
- Profile overlay system (`default` < `global` < selected)
- Subtree extraction via `focus(path)`

### Main API Surface

```typescript
// Creation
Figment.new()
Figment.from(provider)

// Composition
figment.join(provider)
figment.merge(provider)
figment.adjoin(provider)
figment.admerge(provider)

// Profile selection
figment.select(profile)

// Extraction
figment.extract<T>(decode?)       // Full config
figment.extractInner<T>(path)     // Nested value
figment.extractLossy<T>()         // Without tags

// Query
figment.findValue(path)
figment.contains(path)
figment.findMetadata(path)        // Provenance
figment.focus(path)               // Subtree figment

// Provider interface
interface Provider {
  metadata(): Metadata
  data(): ProfileMap | Promise<ProfileMap>
  selectedProfile?(): string | undefined
  metadataMap?(): Map<number, Metadata>
  tagMap?(): ProfileTagMap
}
```

### Example Usage

```typescript
import { Figment, providers } from "figments"

const figment = Figment.new()
  .merge(providers.Toml.file("Config.toml"))
  .merge(providers.Env.prefixed("APP_").split("_"))
  .join(providers.Serialized.default("server.host", "localhost"))

const config = await figment.extract<{ app: { name: string } }>()

// With profile selection
const prodConfig = Figment.new()
  .select("production")
  .merge(providers.Toml.file("Config.toml"))

// Provenance lookup
const source = await figment.findMetadata("server.host")
// source?.name -> "Serialized" or "Toml file" etc.
```

---

## `createFigmentsPlugin()` Design

Following the factory pattern from [Decision 2](#2-plugin-factory-pattern-accepted):

```typescript
// src/plugin/figments.ts
import { plugin } from 'gunshi/plugin'
import { Figment, type Provider, type ConfigDict, type ProfileMap } from 'figments'

export interface FigmentsPluginOptions {
  /** Default profile name (default: "default") */
  defaultProfile?: string
  /** Environment variable for profile selection */
  profileEnvKey?: string
  /** Additional providers to always include */
  providers?: Provider[]
}

export interface FigmentsExtension {
  /** The configured figment instance */
  figment: Figment
  /** Extract typed configuration */
  extract<T>(decode?: (value: ConfigDict) => T): Promise<T>
  /** Get nested value */
  get<T>(path: string): Promise<T>
  /** Check if path exists */
  has(path: string): Promise<boolean>
  /** Get provenance metadata for a path */
  source(path: string): Promise<string | undefined>
}

export function createFigmentsPlugin(options: FigmentsPluginOptions = {}): PluginWithExtension<FigmentsExtension> {
  const {
    defaultProfile = 'default',
    profileEnvKey,
    providers = []
  } = options

  return plugin({
    id: 'figments',
    name: 'Configuration Plugin',
    
    setup: (ctx) => {
      // Add global --config option
      ctx.addGlobalOption({
        name: 'config',
        type: 'string',
        description: 'Path to config file',
        short: 'c'
      })
      
      // Add --profile option
      ctx.addGlobalOption({
        name: 'profile',
        type: 'string',
        description: 'Configuration profile to use'
      })
    },
    
    extension: (ctx, cmd) => {
      // Build figment from options + command options
      const profile = cmd.values.profile 
        || (profileEnvKey ? process.env[profileEnvKey] : undefined)
        || defaultProfile
      
      const figment = Figment.new().select(profile)
      
      // Add config file if specified
      if (cmd.values.config) {
        figment.merge(providers.Toml.file(cmd.values.config))
      }
      
      // Add configured providers
      for (const provider of providers) {
        figment.merge(provider)
      }
      
      // Add environment provider
      figment.merge(
        providers.Env.prefixed('REKON_').split('_')
      )
      
      return {
        figment,
        extract: async <T>(decode?) => figment.extract<T>(decode),
        get: async <T>(path: string) => figment.extractInner<T>(path),
        has: async (path: string) => figment.contains(path),
        source: async (path: string) => (await figment.findMetadata(path))?.name
      }
    }
  })
}

export type { FigmentsPluginOptions, FigmentsExtension }
```

### Usage in Commands

```typescript
// src/command/dl.ts
export default defineCommand({
  name: 'dl',
  async run(ctx) {
    const config = ctx.extensions.figments
    
    // Get config values
    const archiveRoot = await config.get<string>('archive.root')
    const wikiRoot = await config.get<string>('wiki.root')
    
    // Or extract full typed config
    interface DlConfig {
      archive: { root: string }
      wiki: { root: string; enabled: boolean }
    }
    const cfg = await config.extract<DlConfig>()
  }
})
```

### Registration in rekon.ts

```typescript
import { createFigmentsPlugin } from './src/plugin/figments.ts'

await cli(process.argv.slice(2), mainCommand, {
  plugins: [
    createFigmentsPlugin({
      profileEnvKey: 'REKON_PROFILE',
      providers: [
        providers.Toml.file('rekon.toml')
      ]
    }),
    // ... other plugins
  ],
  subCommands: {
    dl: lazy(() => import('./src/command/dl.ts')),
  }
})
```

---

## Extension API Draft

### Type Definitions

```typescript
// Types to re-export from figments plugin
export type {
  Provider,
  ConfigDict,
  ConfigValue,
  ProfileMap,
  Metadata,
  FigmentError
} from 'figments'

export { Figment, providers } from 'figments'
```

### Config File Search Strategy

The plugin should support multiple config file locations:

```typescript
// Search order (first wins):
// 1. --config / -c CLI option
// 2. REKON_CONFIG environment variable
// 3. ./rekon.toml (cwd)
// 4. ./.rekon/rekon.toml
// 5. ~/.config/rekon/config.toml (XDG)
```

### Environment Variable Convention

```typescript
// REKON_<KEY> -> key (lowercased, split on _)
// REKON_ARCHIVE_ROOT -> archive.root
// REKON_WIKI_ENABLED -> wiki.enabled
```

### Profile Selection Priority

```typescript
// 1. --profile CLI option
// 2. REKON_PROFILE environment variable
// 3. default profile
```

---

# Next Steps

1. **Merge repos** - Execute merge plan (when ready)
2. Create `src/plugin/repo.ts` using factory pattern
3. Extract repo parsing logic to `src/repo/` domain modules
4. Create `src/plugin/scraper.ts` from merged dexport code
5. Create `src/plugin/archive.ts` and `src/plugin/wiki.ts`
6. Create `src/plugin/figments.ts` for configuration
7. Convert `dl.ts` to use plugins
8. Convert all commands to lazy loading
