# DL Parser + Repository Provider Architecture

## Problem

The current `dl` command mixes input parsing with repository resolution in ways that make it hard to add new providers or support new input formats:

1. **Global parsing assumptions**: `parseInput()` decides that `org/repo` shorthand means GitHub before any provider sees it
2. **Leaky abstractions**: `isTangledStylePath()` is checked both globally and inside the tangled provider
3. **Providers can't claim formats**: Each provider should own which input formats it handles, but the global parser makes that decision

## Proposed Architecture

Separate concerns into two independent provider types:

### Parser Providers

Parser providers interpret raw input strings into structured data. Each parser handles one input format.

**Examples:**

| Parser | Input Format | Example | Output |
|--------|-------------|---------|--------|
| `ssh` | `git@host:path` | `git@github.com:org/repo` | `{host: "github.com", path: "org/repo"}` |
| `url` | `https://...` | `https://gitlab.com/group/project` | `{host: "gitlab.com", path: "group/project"}` |
| `hostPath` | `host/path` | `github.com/org/repo` | `{host: "github.com", path: "org/repo"}` |
| `shorthand` | `org/repo` | `npmx-dev/npmx.dev` | `{host: undefined, path: "npmx-dev/npmx.dev"}` |

Each parser returns either a `ParseResult` or `null` if the input doesn't match its format.

### Repository Providers

Repository providers validate and resolve parsed inputs into full repository contexts with clone URLs, wiki URLs, etc.

**Examples:**

| Provider | Claims | Behavior |
|----------|--------|----------|
| `github` | `host === "github.com"` or `host === undefined` (shorthand) | Validates via GitHub API, builds context |
| `gitlab` | `host` contains "gitlab" | Validates via GitLab API, handles nested groups |
| `tangled` | `host` in tangled domains, or special tangled-style paths | Validates via fetch, handles domain-as-org format |
| `generic` | Any other host | Validates via HEAD request, best-effort context |

### Resolution Flow

```
                    ┌─────────────────┐
                    │   Raw Input     │
                    │  "org/repo"     │
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │     Parser Providers         │
              │  (run all, collect results)  │
              └──────────────┬───────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  ssh:    │  │  url:    │  │shorthand:│
        │  null    │  │  null    │  │  result  │
        └──────────┘  └──────────┘  └──────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │     ParseResult[]            │
              │  [{host: undefined,          │
              │    path: "org/repo",         │
              │    source: "shorthand"}]     │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │     Repository Providers     │
              │  (try each in priority order)│
              └──────────────┬───────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   ┌───────────┐      ┌───────────┐      ┌───────────┐
   │  github   │      │  gitlab   │      │  tangled  │
   │ canHandle │      │  skip     │      │  skip     │
   │  = true   │      │ (no host) │      │ (no host) │
   └─────┬─────┘      └───────────┘      └───────────┘
         │
         ▼
   ┌───────────┐
   │  resolve  │
   │  → API    │
   │  → ctx    │
   └───────────┘
         │
         ▼
   ┌─────────────────────────────────┐
   │         RepoContext             │
   │  { cloneUrl, repoUrl, ... }     │
   └─────────────────────────────────┘
```

### Key Principles

1. **Parsers are format-specific, not host-specific**: The `shorthand` parser doesn't know about GitHub - it just recognizes `org/repo` format
2. **Repo providers claim parse results**: GitHub provider decides it wants to handle `host: undefined` (shorthand), not the parser
3. **Multiple parse results are possible**: An input might match multiple formats; repo providers see all of them
4. **Fail-fast with clear errors**: If no repo provider handles any parse result, error with what was tried

### Data Structures

**ParseResult:**
- `host`: string | undefined — the parsed host, if any
- `path`: string — the path portion (org/repo, group/project, etc.)
- `segments`: string[] — path split on `/`
- `source`: string — which parser produced this result

**RepoContext:** (unchanged from current)
- `input`: string — original input
- `host`: string — resolved host
- `namespacePath`: string — full path (org/repo)
- `org`: string — organization/user
- `repo`: string — repository name
- `cloneUrl`: string — git clone URL
- `repoUrl`: string — web URL
- `deepwikiUrl`: string — deepwiki link
- `wikiCloneUrl`: string — wiki git URL

### Shared Utilities

Parsers and repo providers can share utility functions:

- `urlExists(url, signal)`: HEAD request to check URL
- `buildRepoContext(host, namespacePath, input)`: construct standard RepoContext
- `stripGitSuffix(path)`: remove `.git` from path
- `stripQueryParams(path)`: remove `?` and `#` portions

### File Structure

```
src/dl/
├── parse/
│   ├── index.ts          # parseWithProviders()
│   ├── types.ts          # ParseResult, ParserProvider
│   ├── ssh.ts            # git@host:path parser
│   ├── url.ts            # https:// parser
│   ├── hostPath.ts       # host/path parser
│   └── shorthand.ts      # org/repo parser
├── resolve/
│   ├── index.ts          # resolveWithProviders()
│   ├── types.ts          # RepoContext, RepoProvider
│   ├── github.ts         # GitHub provider
│   ├── gitlab.ts         # GitLab provider
│   ├── tangled.ts        # Tangled provider
│   └── generic.ts        # Generic fallback provider
├── utils.ts              # shared utilities
└── types.ts              # common types
```

### Benefits

1. **Add new formats easily**: New input format? Add a parser, no changes to repo providers
2. **Add new hosts easily**: New git host? Add a repo provider, reuses existing parsers
3. **Clear ownership**: Each provider owns its logic completely
4. **Testable in isolation**: Parsers and repo providers can be unit tested independently
5. **Explicit precedence**: Provider order determines which handles ambiguous inputs

### Migration Path

1. Create new `parse/` and `resolve/` directory structure
2. Extract parsers from current `parseInput()` into individual parser providers
3. Convert existing repo providers to new interface
4. Update `resolveRepository()` to use new flow
5. Remove old `parseInput()` and related code
