# DL: From Input to Archive

## The Big Picture

The `dl` command is rekon's workhorse. You give it something that identifies a repository — a URL, an SSH path, a bare `org/repo` — and it figures out what you mean, clones the source into `~/archive/`, fetches documentation into `~/wiki/`, and cross-links both. It's the front door to the entire archive system.

The journey of an input through `dl` has three phases:

1. **Parse** — interpret the raw string into structured candidates
2. **Resolve** — validate those candidates against real hosts and yield repository contexts
3. **Act** — clone, export wiki content, cross-link archive and wiki directories

This document covers the redesign of phases 1 and 2. Phase 3 (the actions) already works well and doesn't change, but it does gain a richer `RepoContext` from the new resolution system.

```
  "git@github.com:org/repo"
           │
           ▼
    ┌─────────────┐     All parsers run.
    │   Parse     │     Each one that recognizes the
    │   (src/url) │     format produces a ParseResult.
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐     ParseContext bundles the original
    │ ParseContext │     input with all parse results.
    │ { input,    │     Every provider sees every result.
    │   results } │
    └──────┬──────┘
           │
           ▼
    ┌──────────────┐    All providers run in parallel.
    │   Resolve    │    Each is an async generator that
    │  (src/repo)  │    yields zero or more RepoContexts.
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ RepoContext  │──▶  clone into ~/archive/
    │ RepoContext  │──▶  dexport deepwiki into ~/wiki/
    │ RepoContext  │──▶  sync github wiki
    │   ...        │──▶  cross-link archive ↔ wiki
    └──────────────┘
```

## Why Redesign

The current [`src/dl/repository.ts`](/src/dl/repository.ts) mixes parsing with resolution in ways that make the system brittle:

1. **Global parsing assumptions**: `parseInput()` decides that bare `org/repo` means `host: "github.com"` before any provider sees it. No other host gets a chance.

2. **Leaky abstractions**: `isTangledStylePath()` is checked both in `resolveRepository()` *and* inside the tangled provider. The same condition evaluated in two places, with different consequences. This kind of cross-cutting check is exactly what we want to eliminate.

3. **First-match semantics**: `resolveWithProviders()` stops at the first provider that returns a result. A single input can legitimately resolve to multiple repositories (a shorthand like `org/repo` could exist on GitHub *and* a self-hosted instance), but the current system can't express that.

4. **Host-per-provider coupling**: GitHub, GitLab, and tangled are each a separate `RepoProvider`, but they all do the same thing: try a host, validate a path, build a context. The host-specific bits are just validation strategies, not fundamentally different providers.

## Architecture

### Phase 1: Parse (`src/url/`)

Parsers recognize input *formats*, not hosts. Each parser looks at the raw string and either produces a `ParseResult` or returns `null`. All parsers run on every input — there's no short-circuiting.

| Parser | Recognizes | Example | Result |
|--------|-----------|---------|--------|
| `ssh` | `git@host:path` | `git@github.com:org/repo` | `{ host: "github.com", path: "org/repo" }` |
| `url` | `scheme://...` | `https://gitlab.com/group/project` | `{ host: "gitlab.com", path: "group/project" }` |
| `host-path` | `dotted.host/path` | `tangled.sh/did:plc:xyz/repo` | `{ host: "tangled.sh", path: "did:plc:xyz/repo" }` |
| `shorthand` | `name/name` (no dots in first segment) | `huggingface/transformers` | `{ host: undefined, path: "huggingface/transformers" }` |

The parsers strip `.git` suffixes, query parameters, and leading slashes as part of normalization. Each parser is a pure function — no network calls, no side effects.

All non-null results are collected into a **`ParseContext`**:

```typescript
interface ParseResult {
  source: string          // which parser produced this ("ssh", "url", "host-path", "shorthand")
  host: string | undefined
  path: string            // normalized path portion
  segments: string[]      // path.split("/"), pre-computed for consumers
}

interface ParseContext {
  input: string           // the original raw input, untouched
  results: ParseResult[]  // every successful parse
}
```

`segments` is pre-computed because multiple providers will want it. The small cost of splitting up front saves repeated work downstream.

A single input can produce multiple parse results. For example, `github.com/org/repo` matches both `host-path` (host: `github.com`) and `url` (after prefixing `https://`). Both results flow downstream.

### Phase 2: Resolve (`src/repo/`)

Repository providers receive the *entire* `ParseContext` — all parse results, not just one. Each provider is an **async generator** that yields zero or more `RepoContext` objects. All providers run. There is no priority ordering, no first-match, no fallback — every provider gets a chance to claim every input.

```typescript
interface RepoProvider {
  name: string
  resolve(ctx: ParseContext): AsyncGenerator<RepoContext>
}
```

The async generator design is important: a provider that tries multiple hosts can yield results as they validate, without buffering. The caller can decide whether to collect all results or stop after the first.

#### The Host Provider

The central insight is that GitHub, GitLab, tangled, and generic hosts aren't fundamentally different providers — they're different **host strategies** plugged into one resolution pattern: "given a host and a path, validate it and build a context."

The **host provider** holds a registry of host strategies. For each `ParseResult` in the context, it finds applicable strategies and tries them. Each strategy knows how to validate a path against its host and how to construct a `RepoContext` from a validated result.

```typescript
interface HostStrategy {
  name: string
  claims(host: string | undefined, segments: string[]): boolean
  buildCandidates(segments: string[]): string[]
  validate(host: string, path: string, signal: AbortSignal): Promise<string | null>
  buildContext(input: string, host: string, namespacePath: string): RepoContext
}
```

Strategies:

| Strategy | Claims | Validation |
|----------|--------|------------|
| `github` | `host` is `github.com`, a GHE domain, or `undefined` (shorthand) | GitHub API `/repos/{org}/{repo}` |
| `gitlab` | `host` contains `"gitlab"` | GitLab API `/projects/{encoded_path}` |
| `tangled` | `host` is a tangled domain, or domain-as-org format | HTTP fetch to `https://{host}/{path}` |
| `generic` | Any host with a path | HTTP HEAD request |

When a `ParseResult` has `host: undefined` (shorthand), *all* strategies that accept hostless inputs get a chance. GitHub claims it. Tangled could claim it if the path segments look like its format. They all run. Multiple `RepoContext` objects can be yielded from a single input.

The host provider is not "the fallback" — it's just a provider. Other providers can exist alongside it. A future provider might resolve npm package names, or look up local filesystem paths, or consult a custom registry. They all implement the same `RepoProvider` interface.

#### RepoContext

```typescript
interface RepoContext {
  input: string          // original raw input
  provider: string       // which provider/strategy resolved this ("github", "gitlab", etc.)
  host: string           // resolved host
  namespacePath: string  // full path (org/repo, group/subgroup/project)
  org: string            // first path segment
  repo: string           // last path segment
  cloneUrl: string       // git clone URL
  repoUrl: string        // web URL
  deepwikiUrl: string    // deepwiki link
  wikiCloneUrl: string   // wiki git URL
  hasGitWiki: boolean    // whether this host supports git-based wikis
}
```

Two additions from the current `RepoContext`:
- **`provider`**: which strategy resolved this, for logging and debugging
- **`hasGitWiki`**: eliminates the hardcoded `if (host === "github.com")` check in [`wiki/sync.ts`](/src/wiki/sync.ts) line 20. The provider knows whether its host supports git wikis — downstream code shouldn't have to guess.

### Phase 3: Act (unchanged)

Once we have `RepoContext` values, the existing action pipeline runs:

1. **Archive sync** ([`src/archive/sync.ts`](/src/archive/sync.ts)): `git clone` or `git pull` into `~/archive/{namespacePath}`
2. **Dexport** ([`src/dexport/sync.ts`](/src/dexport/sync.ts)): export deepwiki content into `~/wiki/{namespacePath}`
3. **Git wiki sync** ([`src/wiki/git.ts`](/src/wiki/git.ts)): clone the wiki repo (when `hasGitWiki` is true)
4. **Cross-linking** ([`src/repo/link.ts`](/src/repo/link.ts)): symlink corresponding archive and wiki directories

Because providers can now yield multiple `RepoContext` values per input, the action pipeline runs for each one. An input that resolves to repos on two different hosts produces two archive checkouts, two wiki exports, etc.

## Shared Utilities (`src/repo/util.ts`)

Parsers and providers share common operations:

- **`urlExists(url, signal)`**: HEAD request with redirect handling
- **`buildRepoContext(opts)`**: standard `RepoContext` constructor, deduplicating the identical object-building code currently copy-pasted across every provider
- **`stripGitSuffix(path)`**: remove `.git` suffix
- **`stripQueryAndFragment(path)`**: remove `?` and `#` portions
- **`RESOLVE_TIMEOUT`**: shared timeout constant (currently hardcoded as `8000` in multiple places)

## File Structure

```
src/url/                        # Phase 1: input parsing
├── index.ts                    # parseAll(): string → ParseContext
├── types.ts                    # ParseResult, ParseContext, Parser interface
├── ssh.ts                      # git@host:path
├── url.ts                      # scheme://host/path
├── host-path.ts                # dotted.host/path
└── shorthand.ts                # org/repo (no dots)

src/repo/                       # Phase 2: repository resolution + repo operations
├── resolve.ts                  # resolveAll(): ParseContext → AsyncGenerator<RepoContext>
├── types.ts                    # RepoContext, RepoProvider
├── host-provider.ts            # the host-based provider (strategy pattern)
├── host/                       # host-specific validation strategies
│   ├── github.ts
│   ├── gitlab.ts
│   ├── tangled.ts
│   └── generic.ts
├── util.ts                     # urlExists, buildRepoContext, RESOLVE_TIMEOUT
└── link.ts                     # (existing) cross-link archive ↔ wiki

src/dl/                         # Orchestration: wires parse → resolve → act
├── types.ts                    # ParsedArgs, ProcessInputOptions, DestinationRoots
├── args.ts                     # CLI argument parsing (unchanged)
├── index.ts                    # processRepoContext, createProcessEntry
└── watch.ts                    # archlist file watcher (unchanged)
```

The current `src/dl/repository.ts` and `src/dl/provider.ts` are eliminated entirely. Their parsing logic moves to `src/url/`, their provider logic moves to `src/repo/`, and the glue code in `resolveRepository()` becomes a thin call in `src/dl/index.ts`.

`src/url/` is named for what it parses — URLs in the broad sense, including shorthands that are URL-adjacent. `src/repo/` is named for what it produces — resolved repository contexts. The `link.ts` file already lives there and fits naturally.

## Cleanup Opportunities

Along the way, these existing issues get fixed:

1. **`isTangledStylePath` eliminated**: this function is checked in two places (`resolveRepository` and `tangledProvider.canHandle`) with different effects. In the new system, tangled's host strategy declares what it claims via `claims()` — one place, one check.

2. **Duplicate `RepoContext` construction consolidated**: currently the `createProvider` helper, `genericProvider`, and `tangledProvider` all build identical `RepoContext` objects with copy-pasted field assignments. The `buildRepoContext` utility replaces all of them.

3. **Hardcoded GitHub wiki check removed**: `wiki/sync.ts` line 20 checks `host === "github.com"` to decide whether to sync a git wiki. The `hasGitWiki` field on `RepoContext` lets each strategy declare this capability.

4. **Hardcoded timeouts consolidated**: `AbortSignal.timeout(8000)` appears in every provider. A shared `RESOLVE_TIMEOUT` constant replaces them.

5. **`ParsedInput` import path cleaned up**: currently `plugin/repo.ts` imports `ParsedInput` from `dl/provider.ts`, an awkward coupling. The new `ParseContext` from `src/url/types.ts` is a cleaner import.

6. **`resolveRepository()` tangled guard removed**: the special-case `if (isTangledStylePath(...))` bypass of the `segments.length < 2` validation in `resolveRepository()` goes away. Segment count requirements are each strategy's concern, not the orchestrator's.

## Migration Path

1. Create `src/url/` with types and all four parsers, extracted from current `parseInput()`
2. Create `src/repo/types.ts`, `src/repo/util.ts`, and `src/repo/host/` strategies extracted from current providers
3. Create `src/repo/host-provider.ts` — the async generator host provider
4. Create `src/repo/resolve.ts` — the provider runner
5. Update `src/dl/index.ts` and `src/plugin/repo.ts` to use the new parse → resolve flow
6. Update `src/wiki/sync.ts` to use `hasGitWiki` instead of host check
7. Update tests in `src/command/dl.test.ts` to test parsers and providers independently
8. Remove `src/dl/repository.ts` and `src/dl/provider.ts`
