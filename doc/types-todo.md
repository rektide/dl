# Type Improvement TODO

Status after `eae72490` ("Reduce type casting with proper gunshi type system usage").

## 1. Remaining `as` casts (9)

All remaining casts are annotated with `// gunshi: plugin-registered global` in source. They share one root cause: gunshi's type system can only infer `ctx.values` from the `args` declared on the command definition. Options registered at runtime via `ctx.addGlobalOption()` inside plugin `setup()` functions are invisible to the compiler.

### 1.1 `ctx.values.org as string | undefined` (6 sites)

**Files:**
- [`src/command/dl.ts`](/src/command/dl.ts) line 72
- [`src/command/archive.ts`](/src/command/archive.ts) line 20
- [`src/command/archlist.ts`](/src/command/archlist.ts) line 20
- [`src/command/deepwiki.ts`](/src/command/deepwiki.ts) line 20
- [`src/command/symlink.ts`](/src/command/symlink.ts) line 20
- [`src/command/wiki.ts`](/src/command/wiki.ts) line 20

**What it casts:** `ctx.values.org` (type `unknown` since `org` isn't in any command's `args`) → `string | undefined`

**Why unavoidable:** The `--org` flag is registered by `positionalInputPlugin` via `ctx.addGlobalOption("org", ...)` in its `setup()` hook. The command definitions have no `org` in their `args`, so gunshi can't infer it.

**To eliminate:** See section 2.1 below — the cleanest fix is to have `PositionalInputExtension` read `org` from `ctx.values` inside `extension()` and expose a typed `org` field (or change `source()` to take no `org` parameter).

### 1.2 `ctx.values as { watch?: boolean }` (1 site)

**File:** [`src/plugin/input-watch.ts`](/src/plugin/input-watch.ts) line 32

**What it casts:** `ctx.values` → `{ watch?: boolean }`

**Why unavoidable:** `--watch` is registered by this same plugin's `setup()` hook.

**To eliminate:** This is already partially solved — the `WatchInputExtension.active` boolean is derived from this cast and callers never read `ctx.values.watch` directly. The cast is fully contained inside the plugin. This is arguably fine as-is.

### 1.3 `ctx.values as { clipboard?: boolean }` (1 site)

**File:** [`src/plugin/input-clipboard.ts`](/src/plugin/input-clipboard.ts) line 32

**What it casts:** `ctx.values` → `{ clipboard?: boolean }`

**Why unavoidable:** Same pattern as watch — `--clipboard` registered by this plugin.

**To eliminate:** Same as watch — `ClipboardInputExtension.active` already absorbs the cast. Fine as-is.

### 1.4 `core.values as LogOptions` (1 site)

**File:** [`src/plugin/log.ts`](/src/plugin/log.ts) line 92

**What it casts:** `core.values` → `LogOptions` (which has `output?`, `outputStdout?`, `outputStderr?`, `json?`)

**Why unavoidable:** `--output`, `--output-stdout`, `--output-stderr`, `--json` are all registered by this plugin's `setup()` hook.

**To eliminate:** See section 2.3 below — the plugin could expose its config as typed fields on `LogExtension`.

---

## 2. Speculation: absorbing plugin-registered globals into extensions

### 2.1 `PositionalInputExtension` could own `org`

**Current signature** ([`src/plugin/input-positional.ts:8`](/src/plugin/input-positional.ts)):

```ts
export interface PositionalInputExtension {
  source: (org: string | undefined, positionals: readonly string[]) => InputSource
}
```

Every caller does:
```ts
const inputs = positional.source(ctx.values.org as string | undefined, ctx.positionals)
```

**Proposed change:** Read `org` inside `extension()` so callers don't need to:

```ts
export interface PositionalInputExtension {
  source: (positionals: readonly string[]) => InputSource
}

// inside extension():
extension: (ctx): PositionalInputExtension => {
  const org = ctx.values.org as string | undefined  // cast stays here, one place
  return {
    source: (positionals) => positionalSource(org, positionals),
  }
},
```

**Impact:** Eliminates 6 casts across all subcommands and dl.ts. The single cast moves into the plugin where `--org` is registered — the one place that knows the option exists.

**Tradeoff:** Slightly less flexible — callers can't override `org` per-call. But no current code does that, and the whole point of the plugin is to manage this concern.

### 2.2 Watch and clipboard: already done

`WatchInputExtension.active` and `ClipboardInputExtension.active` already absorb the plugin-registered `--watch` / `--clipboard` reading. The casts inside those plugins' `extension()` are internal implementation details that don't leak to callers. No action needed.

### 2.3 `LogExtension` could expose typed config

**Current state** ([`src/plugin/log.ts:91-101`](/src/plugin/log.ts)): The `extension()` reads `core.values as LogOptions` to configure JSON formatting and stream modes, then exposes getters:

```ts
getOutputStdout: () => StdioMode | number
getOutputStderr: () => StdioMode | number
```

This is already a good pattern — the plugin absorbs the cast and exposes typed methods. The cast doesn't leak to callers.

**Could go further:** If any caller needs direct access to the raw `LogOptions` (e.g., `json` flag for other formatting decisions), we could add a `json: boolean` field to `LogExtension`. But currently no external code reads these values, so the existing pattern is sufficient.

### 2.4 Moving `dlArgs` into plugins — tradeoffs

`dlArgs` in [`src/command/dl.ts:33-39`](/src/command/dl.ts) defines just one option: `noop`. The other ~15 options are all plugin-registered globals. Moving `noop` into a plugin wouldn't help much.

The more interesting question: could the plugin-registered globals be declared as `args` on the command definitions instead? No — gunshi intentionally separates these. Plugins register global options via `setup()` so they're available to **all** commands (entry + subcommands) without each command repeating them. This is the correct gunshi pattern.

### 2.5 Could `buildSubcommandOptions` / `buildMainOptions` have stronger typing?

**Current signatures** ([`src/command/run.ts`](/src/command/run.ts)):

```ts
function buildMainOptions(
  extensions: DlExtensions,
  values: Record<string, unknown>,
  explicit: Record<string, boolean | undefined>,
  tokens: readonly DlActionToken[],
): DlOptions

function buildSubcommandOptions(
  extensions: DlExtensions,
  values: Record<string, unknown>,
  explicit: Record<string, boolean | undefined>,
  tokens: readonly DlActionToken[],
  primarySpec: DlActionSpec,
  stateValue: unknown,
): DlOptions
```

These accept `Record<string, unknown>` because:
1. `resolveActionOptions` in `DlActionsExtension` takes `Record<string, unknown>` — it reads arbitrary `"<action>-state"` keys that vary per action spec.
2. `buildBaseOptions` reads `values["consume-dexport-output"]`, `values["dry-run"]`, etc. — all plugin-registered.
3. `buildSubcommandOptions` mutates `values` by adding `"${primarySpec.name}-state"` — dynamic key construction.

**Could we use generics?** We could make the callers pass `ctx.values` as a generic `V extends Record<string, unknown>`, but the functions would still need `Record<string, unknown>` internally because of the dynamic key access. The current signature is honest about what the function does — it treats values as a dynamic bag. Making it generic would add type parameters without real safety gains.

**One improvement:** The `buildSubcommandOptions` callers currently pass `ctx.values.state` as the `stateValue` parameter. Since each subcommand's `args` declares `state: { type: "enum", ... }`, gunshi does infer `ctx.values.state` correctly. The `stateValue: unknown` parameter could be `stateValue: string` since all subcommands declare `state` as enum (which is a string type). Minor win.

---

## 3. General type improvement ideas

### 3.1 Pre-existing type errors

Three type errors existed before any work and still exist:

1. **`src/command/input.ts:30`** — `readonly string[]` not assignable to mutable `string[]`. Fix: change the receiving function's parameter to `readonly string[]`.
2. **`src/dexport/types.ts:1`** — Cannot find module `'../dl/types.ts'`. Likely a stale import from a refactor.
3. **`src/plugin/resolve-stream.ts:68`** — `"resolve"` not assignable to `LogStage`. The `LogStage` type ([`src/plugin/log.ts:6`](/src/plugin/log.ts)) doesn't include `"resolve"`. Either add `"resolve"` to `LogStage`, or change the call to use an existing stage like `"sync"` or `"verify"`.

### 3.2 `input-positional.ts` could use typed `plugin()` params

[`src/plugin/input-positional.ts`](/src/plugin/input-positional.ts) still uses untyped `plugin({ ... })`. It has no dependencies, so there's nothing to type on `ctx.extensions`. But if we adopt the pattern from section 2.1 (reading `org` inside `extension()`), we'd need to cast `ctx.values` — at which point adding type params would be moot. Leave as-is unless we do 2.1.

### 3.3 `dl-actions.ts` could use typed `plugin()` params

[`src/plugin/dl-actions.ts`](/src/plugin/dl-actions.ts) still uses untyped `plugin()`. Its `extension()` calls `collectActionSpecsFromExtensions(ctx.extensions)` and `collectActionHandlersFromExtensions(ctx.extensions)` — both accept `Record<string, unknown>` and iterate `Object.values()`. This is intentionally dynamic because `dl-actions` discovers action providers by duck-typing all extensions. Typing the dependency context wouldn't help since it needs to enumerate all extensions, not access specific ones.

### 3.4 `logPlugin` could use typed `plugin()` params

[`src/plugin/log.ts`](/src/plugin/log.ts) has no dependencies and uses `plugin()` untyped. Since it has no `dependencies` array and doesn't access `ctx.extensions`, adding type params would be boilerplate with no benefit. Leave as-is.

### 3.5 `requireExtensions` could return typed refs

[`src/command/context.ts:66-76`](/src/command/context.ts) — `requireExtensions()` returns `{ actions, log, roots, repo }` which loses the specific plugin ID keys. This is fine for its purpose (guard + destructure), but callers that access other extensions still go through `DlExtensions` keyed access, which is already fully typed.

### 3.6 gunshi patterns we're not using

From the gunshi docs read during the type work:

- **`onBeforeCommand` / `onAfterCommand` hooks** — Could replace the `try/catch` + `process.exit(1)` pattern in [`src/command/dl.ts:43-97`](/src/command/dl.ts). These hooks run at the `cli()` level and receive the full context. Benefit: error handling moves from each command's `run()` to a central place. Tradeoff: changes control flow, may be harder to reason about for per-command error policies.

- **Plugin decorators** (`ctx.decorateCommand()`) — Could wrap command runners for cross-cutting concerns like the `hadError` tracking in `processEntries`. Current approach is direct, decorators would add indirection. Not a clear win for this codebase.

- **`onExtension` callback** — Each plugin can define `onExtension` to run logic after all extensions are created. None of our plugins use this. Could be useful for validation or logging that extensions were initialized, but no current need.

### 3.7 `DlExtensions` interface and the `as const` plugin IDs

The `DlExtensions` interface in [`src/command/context.ts`](/src/command/context.ts) uses plugin IDs as computed keys:

```ts
export interface DlExtensions extends Record<string, unknown> {
  [DL_ACTIONS_PLUGIN_ID]: DlActionsExtension
  [ROOTS_PLUGIN_ID]: RootsExtension
  // ...
}
```

This works because each `*_PLUGIN_ID` is declared `as const` (e.g., `"rekon:log" as const`), making it a string literal type. If a plugin ID were ever widened to `string`, the interface would silently break. This is a fragile contract but is the standard gunshi pattern — documented in the plugin type system guide.

---

## Summary of recommended next steps

| Priority | Item | Casts eliminated | Effort |
|---|---|---|---|
| High | Absorb `org` into `PositionalInputExtension` (section 2.1) | 6 | Small |
| Low | Fix `resolve` not in `LogStage` (section 3.1.3) | 0 (fixes pre-existing error) | Trivial |
| Low | Fix `readonly string[]` mismatch (section 3.1.1) | 0 (fixes pre-existing error) | Trivial |
| Low | Fix stale `../dl/types.ts` import (section 3.1.2) | 0 (fixes pre-existing error) | Trivial |
| Low | Change `stateValue: unknown` → `stateValue: string` in `buildSubcommandOptions` (section 2.5) | 0 (tightens types) | Trivial |
