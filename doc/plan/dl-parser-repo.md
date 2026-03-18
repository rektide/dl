# DL: From Input to Archive

## The Big Picture

The `dl` command is rekon's workhorse. You give it something that identifies a repository — a URL, an SSH path, a bare `org/repo` — and it figures out what you mean, clones the source into `~/archive/`, fetches documentation into `~/wiki/`, and cross-links both. It's the front door to the entire archive system.

This document covers the redesign of how `dl` resolves a raw input string into one or more validated repositories. That resolution is the first — and most complex — part of the pipeline, and its output feeds every action that follows.

### How This Fits Rekon's Architecture

Rekon follows a layered architecture (see [`gunshi-decomposition.md`](/doc/discovery/gunshi-decomposition.md)):

- **Domain libraries** (`src/<domain>/`) contain the real logic — pure functions, network calls, data structures. No CLI coupling. Testable in isolation.
- **Gunshi plugins** (`src/plugin/`) are thin adapters that expose domain APIs as extensions via gunshi's context system. They wire up config and lifecycle but contain no business logic.
- **Commands** (`src/command/`) are orchestration — they parse CLI intent and call plugin extensions. Thin as possible.

This redesign introduces two new domain libraries:

| Domain | Location | Responsibility |
|--------|----------|----------------|
| **url** | `src/url/` | Expand raw input strings into candidate URLs |
| **repo** | `src/repo/` | Validate candidate URLs against real hosts, produce `RepoContext` |

These are consumed by the existing `rekon:repo` plugin ([`src/plugin/repo.ts`](/src/plugin/repo.ts)), which exposes them to commands. The plugin gets richer; the command stays thin.

## The Data Journey

A single `RepoContext` flows through the entire pipeline, accumulating fields as information resolves. There are no intermediate types — the context starts sparse and grows.

```
  "git@github.com:org/repo"
           │
           ▼
    ┌─────────────┐     All expanders run on the raw string.
    │   Expand    │     Each produces candidate URLs.
    │  (src/url)  │     Deduped by URL.toString() via Set.
    └──────┬──────┘
           │
           ▼
      URL[]  (deduplicated)
           │
           ▼
    ┌─────────────┐     Registry maps host → Repo.
    │   Verify    │     Repo.resolve(url) returns a
    │  (src/repo) │     RepoContext with url set,
    └──────┬──────┘     or undefined for no match.
           │
           ▼
    RepoContext  (input, inputUrl, url, source filled in)
           │
           ▼
    ┌─────────────┐     Separate Repo methods fill in
    │   Enrich    │     optional fields: deepwikiUrl,
    │  (src/repo) │     wikiGitUrl.
    └──────┬──────┘
           │
           ▼
    RepoContext  (fully resolved)
           │
           ├──▶  git clone into ~/archive/     (src/archive)
           ├──▶  dexport deepwiki into ~/wiki/  (src/dexport)
           ├──▶  sync git wiki                  (src/wiki, when wikiGitUrl present)
           └──▶  cross-link archive ↔ wiki      (src/repo/link.ts)
```

Multiple `RepoContext` values can emerge from a single input. A bare `org/repo` might resolve on both GitHub and a self-hosted instance. The action pipeline runs for each.

## Why Redesign

The current [`src/dl/repository.ts`](/src/dl/repository.ts) mixes URL parsing with host validation:

1. **Global parsing assumptions**: `parseInput()` decides that bare `org/repo` means `host: "github.com"` before any provider gets a chance. No other host is tried.

2. **Leaky abstractions**: `isTangledStylePath()` is checked both in `resolveRepository()` and inside the tangled provider — the same condition in two places with different consequences.

3. **First-match semantics**: `resolveWithProviders()` stops at the first provider that returns a result. A single input can legitimately resolve to multiple repositories, but the system can't express that.

4. **Hardcoded host logic in actions**: [`wiki/sync.ts`](/src/wiki/sync.ts) checks `host === "github.com"` to decide whether to sync a git wiki. Host-specific behavior should come from the provider, not downstream code.

## RepoContext

One interface flows through the entire pipeline. Fields start unset and resolve progressively. All consumers — providers, plugins, actions — take the interface, never the class.

```typescript
interface Source {
  expander?: string     // which expander produced inputUrl (by name)
  provider?: string     // which Repo resolved it (by name)
}

interface RepoContext {
  input?: string        // original raw string, set by pipeline
  inputUrl?: URL        // candidate URL from expander, set by pipeline
  url?: URL             // canonical git URL, set by Repo.resolve()
  source: Source        // tracks provenance

  deepwikiUrl?: URL     // set by Repo.resolveDeepwiki()
  wikiGitUrl?: URL      // set by Repo.resolveWiki()

  // Computed from url pathname. Not stored — derived on access.
  // Extension-less basename = project, rest of path = org.
  readonly project: string | undefined
  readonly org: string | undefined
}
```

For `https://github.com/huggingface/transformers.git`:
- `project` → `"transformers"`
- `org` → `"huggingface"`

For `https://gitlab.com/group/subgroup/project.git`:
- `project` → `"project"`
- `org` → `"group/subgroup"`

The default implementation:

```typescript
class DefaultRepoContext implements RepoContext {
  input?: string
  inputUrl?: URL
  url?: URL
  source: Source = {}
  deepwikiUrl?: URL
  wikiGitUrl?: URL

  get project(): string | undefined {
    if (!this.url) return undefined
    const base = this.url.pathname.split("/").filter(Boolean).at(-1)
    return base?.replace(/\.git$/, "")
  }

  get org(): string | undefined {
    if (!this.url) return undefined
    const segments = this.url.pathname.split("/").filter(Boolean)
    if (segments.length < 2) return undefined
    return segments.slice(0, -1).map(s => s.replace(/\.git$/, "")).join("/")
  }
}
```

## Repo

A `Repo` resolves a candidate URL into a `RepoContext`. It tests whether the URL points to a real repository and returns the context with `url` set to the canonical git URL — or `undefined` if the candidate isn't valid.

```typescript
interface Repo {
  name: string
  resolve(url: URL, signal: AbortSignal): Promise<RepoContext | undefined>
  resolveWiki?(ctx: RepoContext): void
  resolveDeepwiki?(ctx: RepoContext): void
}
```

`resolve` does the network validation — calls an API, makes a HEAD request, whatever the host requires. It constructs a `RepoContext` with `url` set. The pipeline fills in `input`, `inputUrl`, and `source` after.

`resolveWiki` and `resolveDeepwiki` are separate methods that operate on an existing `RepoContext` and fill in their respective URL fields. They run during the enrich phase. Not every `Repo` supports these — they're optional.

Provider implementations live in `src/repo/provider/`:

| Provider | File | Validation | Wiki | Deepwiki |
|----------|------|-----------|------|----------|
| GitHub | `src/repo/provider/github.ts` | GitHub API `/repos/{org}/{project}` | `.wiki.git` URL | deepwiki.com link |
| GitLab | `src/repo/provider/gitlab.ts` | GitLab API `/projects/{encoded_path}` | GitLab wiki URL | deepwiki.com link |
| Tangled | `src/repo/provider/tangled.ts` | HTTP fetch to host | — | — |
| Generic | `src/repo/provider/generic.ts` | HTTP HEAD request | — | — |

The generic provider's HEAD-request approach is loose — a 200 doesn't prove it's a git repo. This is a known limitation that should be improved over time (try `git ls-remote`, look for forge markers, etc.).

## Expanders

Expanders are the entry point. They take a raw input string and produce candidate URLs. Each expander recognizes one input format. All expanders run on every input — there's no short-circuiting.

```typescript
interface Expander {
  name: string
  expand(input: string): URL[]
}
```

| Expander | Recognizes | Example Input | Produces |
|----------|-----------|---------------|----------|
| `url` | Has a scheme (`https://`, `ssh://`, etc.) | `https://github.com/org/repo` | `[URL("https://github.com/org/repo")]` |
| `ssh` | `git@host:path` format | `git@github.com:org/repo.git` | `[URL("https://github.com/org/repo")]` |
| `host-path` | First segment has dots or is `localhost` | `github.com/org/repo` | `[URL("https://github.com/org/repo")]` |
| `shorthand` | Bare path, no dots in first segment | `org/repo` | One URL per configured default host |

The `shorthand` expander is configured with the full list of default hosts to try. This is configurable — add Codeberg, a GHE instance, whatever. It's where a hostless input fans out into the full candidate space.

Expanders strip `.git` suffixes, query parameters, and leading slashes as part of normalization. Each expander is a pure function — no network calls, no side effects.

## Registry

The registry maps hosts to `Repo` providers.

```typescript
interface RepoRegistry {
  byHost: Map<string, Repo>
  generic: Repo

  register(provider: Repo): void
  lookup(host: string): Repo    // always returns something — falls through to generic
}
```

`lookup` checks `byHost` first (O(1)), falls through to `generic` for unknown hosts. The generic provider isn't special — it's just the one that handles hosts without a registered provider.

## Pipeline

Three explicit phases. Each does one job, each is a standalone function in the domain library.

```typescript
// Phase 1: Expand — src/url/index.ts
// Run all expanders on raw input, dedup by URL.toString()
function expand(input: string, expanders: Expander[]): { url: URL, expander: string }[] {
  const seen = new Set<string>()
  const candidates: { url: URL, expander: string }[] = []
  for (const exp of expanders) {
    for (const url of exp.expand(input)) {
      const key = url.toString()
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({ url, expander: exp.name })
    }
  }
  return candidates
}

// Phase 2: Verify — src/repo/resolve.ts
// Test candidates against real hosts, yield RepoContexts
async function* verify(
  input: string,
  candidates: { url: URL, expander: string }[],
  registry: RepoRegistry,
  signal: AbortSignal,
): AsyncGenerator<RepoContext> {
  for (const candidate of candidates) {
    const repo = registry.lookup(candidate.url.host)
    const ctx = await repo.resolve(candidate.url, signal)
    if (!ctx) continue

    ctx.input = input
    ctx.inputUrl = candidate.url
    ctx.source.expander = candidate.expander
    ctx.source.provider = repo.name
    yield ctx
  }
}

// Phase 3: Enrich — src/repo/resolve.ts
// Fill in optional wiki/deepwiki URLs
function enrich(ctx: RepoContext, registry: RepoRegistry): void {
  const repo = registry.lookup(ctx.url!.host)
  repo.resolveDeepwiki?.(ctx)
  repo.resolveWiki?.(ctx)
}
```

## Plugin Integration

The domain libraries in `src/url/` and `src/repo/` are consumed by the `rekon:repo` plugin ([`src/plugin/repo.ts`](/src/plugin/repo.ts)). The plugin is a thin adapter — it creates the registry, registers providers, configures expanders, and exposes the pipeline to commands.

```typescript
// src/plugin/repo.ts
export const REPO_PLUGIN_ID = "rekon:repo" as const

export interface RepoExtension {
  resolve(input: string): AsyncGenerator<RepoContext>
}

export function createRepoPlugin(options?: {
  defaultHosts?: string[]
}) {
  return plugin({
    id: REPO_PLUGIN_ID,
    name: "Rekon Repository",
    extension: (): RepoExtension => {
      // Build registry from domain providers
      const registry = createRegistry()
      registry.register(githubProvider)
      registry.register(gitlabProvider)
      registry.register(tangledProvider)
      // generic is the registry's built-in fallback

      // Build expanders with configured default hosts
      const expanders = createExpanders({
        defaultHosts: options?.defaultHosts ?? ["github.com"],
      })

      return {
        async *resolve(input: string) {
          const signal = AbortSignal.timeout(RESOLVE_TIMEOUT)
          const candidates = expand(input, expanders)
          for await (const ctx of verify(input, candidates, registry, signal)) {
            enrich(ctx, registry)
            yield ctx
          }
        },
      }
    },
  })
}
```

Commands stay thin — they call `repoExtension.resolve(input)` and iterate the results:

```typescript
// src/command/dl.ts (simplified)
const repoExtension = ctx?.extensions?.[REPO_PLUGIN_ID]
for await (const resolved of repoExtension.resolve(input)) {
  await processRepoContext(resolved, roots, options)
}
```

This follows the existing pattern: `rekon:git` wraps `src/git/`, `rekon:dexport` wraps `src/dexport/`, and now `rekon:repo` wraps `src/url/` + `src/repo/`. The domain libraries are independently testable. The plugins compose them for command use.

## File Structure

```
src/url/                            # Domain: input → candidate URLs
├── index.ts                        # expand()
├── types.ts                        # Expander interface
├── ssh.ts                          # git@host:path → URL
├── url.ts                          # scheme://... → URL
├── host-path.ts                    # dotted.host/path → URL
└── shorthand.ts                    # org/repo → URL[] (one per default host)

src/repo/                           # Domain: URL validation + repo operations
├── context.ts                      # RepoContext interface + DefaultRepoContext
├── types.ts                        # Repo interface, Source interface
├── registry.ts                     # RepoRegistry: host → Repo lookup
├── resolve.ts                      # verify() + enrich() pipeline phases
├── provider/                       # Repo implementations per host type
│   ├── github.ts
│   ├── gitlab.ts
│   ├── tangled.ts
│   └── generic.ts                  # TODO: iterate on detection heuristics
├── util.ts                         # urlExists, RESOLVE_TIMEOUT
└── link.ts                         # (existing) cross-link archive ↔ wiki

src/plugin/
├── repo.ts                         # rekon:repo — wraps src/url + src/repo
├── roots.ts                        # rekon:roots — (existing, unchanged)
├── git.ts                          # rekon:git — (existing, unchanged)
└── dexport.ts                      # rekon:dexport — (existing, unchanged)

src/dl/                             # Orchestration: wires plugins → actions
├── types.ts                        # ParsedArgs, ProcessInputOptions, DestinationRoots
├── args.ts                         # CLI argument parsing (unchanged)
├── index.ts                        # processRepoContext, createProcessEntry
└── watch.ts                        # archlist file watcher (unchanged)

src/command/
└── dl.ts                           # Thin command — parses CLI, calls plugins
```

The current `src/dl/repository.ts` and `src/dl/provider.ts` are eliminated. Their URL parsing moves to `src/url/`, their provider logic moves to `src/repo/provider/`, and the orchestration in `src/dl/index.ts` calls the plugin.

## Cleanup

Along the way:

1. **`isTangledStylePath` eliminated** — tangled is just a `Repo` in `src/repo/provider/tangled.ts` that validates its own URLs. No cross-cutting checks anywhere.

2. **Duplicate context construction consolidated** — every provider currently copy-pastes the same `RepoContext` object literal with identical field assignments. Now they all return `DefaultRepoContext` instances.

3. **Hardcoded GitHub wiki check removed** — [`wiki/sync.ts`](/src/wiki/sync.ts) currently checks `host === "github.com"`. Now it checks whether `ctx.wikiGitUrl` is set. The provider decides capabilities, not downstream code.

4. **Hardcoded timeouts consolidated** — `AbortSignal.timeout(8000)` appears in every provider. A shared `RESOLVE_TIMEOUT` constant in `src/repo/util.ts` replaces them.

5. **`DestinationRoots` type moves** — currently in `src/dl/types.ts` but used by `src/archive/` and `src/wiki/`. Belongs somewhere shared, likely `src/repo/types.ts` or its own home.

## Migration Path

1. Create `src/repo/context.ts` — `RepoContext` interface + `DefaultRepoContext` class
2. Create `src/repo/types.ts` — `Repo`, `Source`, `RepoRegistry` interfaces
3. Create `src/url/` — expander interface + all four expanders, extracted from current `parseInput()`
4. Create `src/repo/provider/` — github, gitlab, tangled, generic providers extracted from current code
5. Create `src/repo/registry.ts` — host → provider lookup
6. Create `src/repo/resolve.ts` — verify + enrich pipeline phases
7. Update `src/plugin/repo.ts` — wire up expand → verify → enrich, expose `AsyncGenerator<RepoContext>`
8. Update `src/dl/index.ts` — consume the new plugin interface, iterate `RepoContext` results
9. Update `src/wiki/sync.ts` — check `ctx.wikiGitUrl` instead of `host === "github.com"`
10. Update `src/command/dl.ts` — adjust for async generator from plugin
11. Update tests in `src/command/dl.test.ts` — test expanders and providers independently
12. Remove `src/dl/repository.ts` and `src/dl/provider.ts`
