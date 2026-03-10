# Gunshi Decomposition (Draft)

Goal: decompose `rekon` commands so `src/command/` stays thin, domain logic lives in `src/<domain>/`, and shared command capabilities are available through Gunshi plugins.

This draft emphasizes:
- explicit `tinyexec` usage (no tiny wrapper helpers that hide behavior)
- incremental migration with low behavior risk
- plugin boundaries that match real capabilities (`archive`, `wiki`, `repo`, `archlist`, etc.)

## Current Situation

- `dl` has already started decomposition into `src/dl/*`.
- Several concerns are still mixed inside the `dl` domain implementation:
  - repository parsing/resolution
  - archive syncing and jj setup
  - wiki syncing (dexport/github wiki clone)
  - archlist append/watch queue
  - project linking
- We want command files to be orchestration only, with reusable services underneath.

## Design Principles

1. Keep command modules thin
- `src/command/*.ts` should parse CLI intent and call services.
- No deep filesystem/network/process logic in command files.

2. Prefer domain modules first, plugins second
- Build stable domain APIs in `src/<domain>/`.
- Wrap those APIs as Gunshi plugins when there is shared lifecycle/config/context value.

3. Use explicit `tinyexec`
- Call `x(...)` directly at call sites where process semantics matter.
- Avoid reintroducing generic wrappers like `runCommand/getCommandOutput`.
- Keep only narrowly-scoped helpers where they encode real policy (example: detached process launch semantics).

4. Keep plugin APIs capability-oriented
- Extensions should expose meaningful operations (`syncWiki`, `resolveRepository`) instead of generic utility bags.

5. Make migration reversible
- Move one concern at a time.
- Preserve behavior and CLI surface while moving internals.

## Target Structure

Proposed shape after decomposition:

```text
src/
  command/
    dl.ts
    project-link.ts
    ...

  dl/
    args.ts
    types.ts
    orchestration.ts      # optional shared flow wiring

  repo/
    parse.ts
    resolve.ts

  archive/
    sync.ts               # clone/update + jj init/bookmark policy

  wiki/
    sync.ts               # github deepwiki/dexport + non-github wiki clone

  archlist/
    append.ts
    watch.ts              # serial queue + tail semantics

  plugin/
    repo.ts
    archive.ts
    wiki.ts
    archlist.ts
    roots.ts
```

Notes:
- `src/dl/*` can shrink over time as behavior moves into shared domains.
- `src/plugin/*` should be adapters over domain modules, not where core logic lives.

## Plugin Candidates

### `rekon:roots`
- Responsibility: resolve/provide destination roots and related config.
- Why plugin: many commands can share this context.

### `rekon:repo`
- Responsibility: parse and resolve repository inputs to canonical repo identity.
- Why plugin: reused by `dl`, potential future import/sync commands.

### `rekon:archive`
- Responsibility: archive clone/update + jj initialization policy.
- Why plugin: encapsulates side effects and root-aware behavior.

### `rekon:wiki`
- Responsibility: wiki sync strategy (dexport for GitHub, wiki.git elsewhere).
- Why plugin: strategy and dependencies are likely to evolve.

### `rekon:archlist`
- Responsibility: append entries and watch appended lines serially.
- Why plugin: long-running lifecycle and queue policy belong in one place.

### `rekon:project-link` (optional plugin)
- Responsibility: unify link invocation and event logging policy.
- Why optional: might remain a plain domain module if only one command uses it.

## Migration Plan

Phase 1: Stabilize domain boundaries
- Split `src/dl/process.ts` into domain modules:
  - `src/archive/sync.ts`
  - `src/wiki/sync.ts`
  - keep repo parsing in `src/repo/*`
- Keep `src/command/dl.ts` behavior unchanged.

Phase 2: Introduce foundational plugin(s)
- Add `rekon:roots` and `rekon:repo` plugins.
- Convert `dl` to consume extension APIs for roots/repo resolution.

Phase 3: Move side-effect capabilities to plugins
- Add `rekon:archive`, `rekon:wiki`, `rekon:archlist` plugins.
- Keep archlist watch serial semantics and current feedback-loop guard.

Phase 4: Normalize command architecture
- Ensure command files mostly wire args to plugin calls.
- Move shared option/validation policy to plugin setup where appropriate.

Phase 5: Hardening and docs
- Add targeted tests per domain/plugin.
- Document extension contracts and expected error semantics.

## Risks and Guardrails

Risk: plugin overreach too early
- Guardrail: first extract domain modules with tests, then pluginize.

Risk: behavior drift during refactor
- Guardrail: preserve existing CLI flags/output semantics while moving code.

Risk: hidden process behavior
- Guardrail: keep `tinyexec` calls explicit, avoid abstraction unless policy is real and shared.

Risk: command/plugin coupling gets opaque
- Guardrail: keep extension interfaces small and named by capability.

## Open Questions

- Should `project-link` stay a domain module or become a plugin now?
- Which global flags should be plugin-provided versus command-local?
- Do we want a typed `DlContext` for orchestration only, or rely entirely on plugin extensions?

## Future Work

- Adopt the Gunshi author's logger plugin for CLI logging once the decomposition settles.
- This is intentionally deferred so we do not mix logging migration with the structural refactor.

## Immediate Next Step

Create beads tickets for each migration phase and annotate this document with ticket IDs.

## Ticket Mapping

- Phase 1: Split dl process into archive and wiki domain modules (`rekon-gunshi-domain-split`)
- Phase 2: Add roots and repo Gunshi plugins (`rekon-gunshi-roots-repo-plugin`)
- Phase 3: Add archive wiki and archlist Gunshi plugins (`rekon-gunshi-capability-plugins`)
- Phase 4: Normalize command wiring to thin orchestration (`rekon-gunshi-thin-command-wiring`)
- Phase 5: Add decomposition tests and extension docs (`rekon-gunshi-tests-docs`)
