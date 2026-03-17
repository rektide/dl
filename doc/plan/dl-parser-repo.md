# DL: From Input to Archive

## The Big Picture

The `dl` command is rekon's workhorse. You give it something that identifies a repository — a URL, an SSH path, a bare `org/repo` — and it figures out what you mean, clones the source into `~/archive/`, fetches documentation into `~/wiki/`, and cross-links both. It's the front door to the entire archive system.

The journey of an input through `dl` has three phases:

1. **Expand** — interpret the raw input string into candidate URLs
2. **Verify** — test candidates against real hosts, resolve canonical git URLs
3. **Enrich** — fill in optional capabilities like wiki and deepwiki URLs

A single `RepoContext` flows through all three phases, accumulating fields as information resolves. There are no intermediate types — just one context that grows.

```
  "git@github.com:org/repo"
           │
           ▼
    ┌─────────────┐     All expanders run on the raw string.
    │   Expand    │     Each produces candidate URLs.
    │             │     Deduped by URL.toString() via Set.
    └──────┬──────┘
           │
           ▼
      URL[]  (deduplicated)
           │
           ▼
    ┌─────────────┐     Registry maps host → Repo.
    │   Verify    │     Repo.resolve(url) returns a
    │             │     RepoContext with url set,
    │             │     or undefined for no match.
    └──────┬──────┘
           │
           ▼
    RepoContext  (input, inputUrl, url, source filled in)
           │
           ▼
    ┌─────────────┐     Separate Repo methods fill in
    │   Enrich    │     optional fields: deepwikiUrl,
    │             │     wikiGitUrl.
    └──────┬──────┘
           │
           ▼
    RepoContext  (fully resolved)
           │
           ├──▶  git clone into ~/archive/
           ├──▶  dexport deepwiki into ~/wiki/
           ├──▶  sync git wiki (when wikiGitUrl present)
           └──▶  cross-link archive ↔ wiki
```

Multiple `RepoContext` values can emerge from a single input. A bare `org/repo` might resolve on both GitHub and a self-hosted instance. The action pipeline runs for each.

## Why Redesign

The current [`src/dl/repository.ts`](/src/dl/repository.ts) mixes parsing with resolution:

1. **Global parsing assumptions**: `parseInput()` decides that bare `org/repo` means `host: "github.com"` before any provider gets a chance. No other host is tried.

2. **Leaky abstractions**: `isTangledStylePath()` is checked both in `resolveRepository()` and inside the tangled provider — the same condition in two places with different consequences.

3. **First-match semantics**: `resolveWithProviders()` stops at the first provider that returns a result. A single input can legitimately resolve to multiple repositories, but the system can't express that.

4. **Hardcoded host logic**: `wiki/sync.ts` checks `host === "github.com"` to decide whether to sync a git wiki. Host-specific behavior should come from the provider, not downstream code.

## RepoContext

One interface flows through the entire pipeline. Fields start unset and resolve progressively.

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

  // Computed from url. Extension-less basename = project, rest = org.
  readonly project: string | undefined
  readonly org: string | undefined
}
```

`org` and `project` are computed from `url.pathname` on access — not stored. The extension-less basename of the path is the project, everything before it is the org. For `https://github.com/huggingface/transformers.git`:
- `project` → `"transformers"`
- `org` → `"huggingface"`

For `https://gitlab.com/group/subgroup/project.git`:
- `project` → `"project"`
- `org` → `"group/subgroup"`

The default implementation is a class:

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

All consumers — providers, actions, everything downstream — take the `RepoContext` interface, never the class directly.

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

`resolve` does the network validation. It constructs a `RepoContext` with `url` set. The pipeline fills in `input`, `inputUrl`, and `source` after.

`resolveWiki` and `resolveDeepwiki` are separate methods that operate on an existing `RepoContext` and fill in their respective fields. They run during the enrich phase. Not every `Repo` supports these — they're optional.

Provider implementations live in `src/repo/provider/`:

| Provider | Validation | Wiki | Deepwiki |
|----------|-----------|------|----------|
| `src/repo/provider/github.ts` | GitHub API `/repos/{org}/{project}` | `.wiki.git` clone URL | deepwiki.com link |
| `src/repo/provider/gitlab.ts` | GitLab API `/projects/{encoded_path}` | GitLab wiki URL | deepwiki.com link |
| `src/repo/provider/tangled.ts` | HTTP fetch to host | none | none |
| `src/repo/provider/generic.ts` | HTTP HEAD request (TODO: iterate — try `git ls-remote`, smarter repo detection) | none | none |

## Expanders

Expanders take a raw input string and produce candidate URLs. Each expander recognizes one input format. All expanders run on every input — there's no short-circuiting.

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
| `shorthand` | Bare path, no dots in first segment | `org/repo` | `[URL("https://github.com/org/repo"), URL("https://gitlab.com/org/repo"), ...]` |

The `shorthand` expander is configured with the full list of default hosts to try. This is configurable — add Codeberg, add a GHE instance, whatever makes sense.

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

`lookup` checks `byHost` first, falls through to `generic` for unknown hosts. The generic provider isn't special — it's just the one that handles hosts without a specific provider registered.

## Pipeline

Three explicit phases. Each does one thing to the `RepoContext`.

```typescript
// Phase 1: Expand
// Run all expanders, dedup by URL.toString()
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

// Phase 2: Verify
// Look up provider per host, resolve, fill in context fields
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

// Phase 3: Enrich
// Fill in optional wiki/deepwiki URLs
function enrich(ctx: RepoContext, registry: RepoRegistry): void {
  const repo = registry.lookup(ctx.url!.host)
  repo.resolveDeepwiki?.(ctx)
  repo.resolveWiki?.(ctx)
}
```

## File Structure

```
src/url/                            # Expanders: raw input → candidate URLs
├── index.ts                        # expand(): string → {url, expander}[]
├── types.ts                        # Expander interface
├── ssh.ts                          # git@host:path → URL
├── url.ts                          # scheme://... → URL
├── host-path.ts                    # dotted.host/path → URL
└── shorthand.ts                    # org/repo → URL[] (one per default host)

src/repo/                           # Repository resolution + operations
├── context.ts                      # RepoContext interface + DefaultRepoContext class
├── types.ts                        # Repo interface, Source interface
├── registry.ts                     # RepoRegistry: host → Repo lookup
├── resolve.ts                      # verify() + enrich() pipeline phases
├── provider/                       # Repo implementations per host type
│   ├── github.ts
│   ├── gitlab.ts
│   ├── tangled.ts
│   └── generic.ts                  # TODO: iterate — smarter repo detection
├── util.ts                         # urlExists, RESOLVE_TIMEOUT
└── link.ts                         # (existing) cross-link archive ↔ wiki

src/dl/                             # Orchestration: wires expand → verify → enrich → act
├── types.ts                        # ParsedArgs, ProcessInputOptions, DestinationRoots
├── args.ts                         # CLI argument parsing (unchanged)
├── index.ts                        # processRepoContext, createProcessEntry
└── watch.ts                        # archlist file watcher (unchanged)
```

The current `src/dl/repository.ts` and `src/dl/provider.ts` are eliminated entirely. Their URL parsing moves to `src/url/`, their provider logic moves to `src/repo/provider/`, and the orchestration stays in `src/dl/index.ts`.

## Cleanup

Along the way:

1. **`isTangledStylePath` eliminated** — tangled is just a provider in `src/repo/provider/tangled.ts` that validates its own URLs. No cross-cutting checks.

2. **Duplicate context construction consolidated** — every provider currently copy-pastes the same `RepoContext` object literal. Now they all return `DefaultRepoContext` instances (or any `RepoContext` implementation).

3. **Hardcoded GitHub wiki check removed** — `wiki/sync.ts` currently checks `host === "github.com"`. Now it checks whether `ctx.wikiGitUrl` is set. The provider decides, not downstream code.

4. **Hardcoded timeouts consolidated** — `AbortSignal.timeout(8000)` appears in every provider. A shared `RESOLVE_TIMEOUT` constant in `src/repo/util.ts` replaces them.

5. **Generic provider needs iteration** — the current HEAD-request approach is loose. Future improvements could try `git ls-remote`, check for `.git/` paths, or look for forge-specific markers. The plan acknowledges this with TODO comments in the code.

## Migration Path

1. Create `src/repo/context.ts` with `RepoContext` interface and `DefaultRepoContext` class
2. Create `src/repo/types.ts` with `Repo`, `Source`, and registry interfaces
3. Create `src/url/` with expander interface and all four expanders, extracted from current `parseInput()`
4. Create `src/repo/provider/` with github, gitlab, tangled, and generic providers extracted from current code
5. Create `src/repo/registry.ts` with host → provider lookup
6. Create `src/repo/resolve.ts` with verify and enrich pipeline phases
7. Update `src/dl/index.ts` to use the new expand → verify → enrich flow
8. Update `src/plugin/repo.ts` to expose new interfaces
9. Update `src/wiki/sync.ts` to check `ctx.wikiGitUrl` instead of `host === "github.com"`
10. Update tests in `src/command/dl.test.ts` to test expanders and providers independently
11. Remove `src/dl/repository.ts` and `src/dl/provider.ts`
