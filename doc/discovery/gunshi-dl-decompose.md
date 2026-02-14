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

# Decision Points

1. **Plugin registration location**
   - Option A: Register plugins in [`rekon.ts`](/home/rektide/src/rekon/rekon.ts) globally
   - Option B: Each command registers its needed plugins
   - Recommendation: Option A for shared plugins (archive, wiki), keeps commands thin

2. **Extension naming**
   - Plugin ID vs extension key: `ctx.extensions['archive']` vs `ctx.extensions.archive`
   - gunshi uses the plugin's `id` as the extension key

3. **Domain module vs plugin separation**
   - Keep domain logic in `src/archive/`, `src/wiki/` as pure functions
   - Plugins in `src/plugin/` wrap domain modules and expose via extension
   - This allows domain code to be tested independently

4. **Dexport integration**
   - Current: hardcoded path `~/src/dexport/src/cli.ts`
   - Plugin could make this configurable via global option

---

# Discussion Questions

1. Should plugins be registered globally or per-command?
2. How to handle shared state between plugins (e.g., resolved roots)?
3. Should `--no-log-cache` become a global option added by wiki plugin?
4. How to handle plugin dependencies (e.g., wiki depends on repository)?

---

# Next Steps

1. Create `src/plugin/archive.ts` with basic extension
2. Refactor clone/update logic to `src/archive/clone.ts`
3. Update `dl.ts` to use archive plugin extension
4. Repeat for wiki and repository plugins
5. Convert all commands to lazy loading
