# Experimenting

# Documentation / reference materials

- make markdown links to the canonical url for entries, for example [`/README.md`](/README.md) for local files or [`rektide/compfuzor` `README.md`](https://github.com/rektide/compfuzor/blob/main/README.mdL10-20) for a remote canonical reference to lines 10-20 of `README.md` in `rektide/compfuzor` project, file `README.md` (for the main branch). the org/repository isn't required each time but should be explicitly included in the link text if we haven't been talking about that org/repository recently.
- the `summarizer` tool is WIP and not done yet. but will latter be a tool to write and read INDEX files in documentation directories to be aware of what's included in the directory.

# well known directories and files

- `~/wiki/<repo-org>/<repo-name>` has wiki resources describing projects.
- `~/archive/<repo-org>/<repo-name>` is the place for git checkouts of projects, with the organization name included in the directory tree here. `~/src/<repo-name>` or `~/src/<repo-name>-<workspace-name>` has 1st party checkouts for projects by the author.
- read a `/llms.txt` from each project inthe archive. it might not exist, that's fine.
- `~/ff` is future-fuze, our collection of kubernetes related resources
- `/opt` and `/srv` for general software installs, and for instances of software / services
- if you want to checkout source, get the repo and wiki for it via `~/src/rekon/src/command/dl.ts <url>`
- when writing files to explore behavior, please use a `.test-agent` folder at the top of the project for temporary files (creating it if needed), so they can be managed & cleaned up effectively.

# Project Planning

- do not write time-frames like "days" or "weeks" into plans. your estimates are crude and will not match the actual delivery timelines: leave your time estimates out.
- mermaid diagrams are excellent visual references. use meaningful node identifiers when creating them.
- breaking changes are fine if a project is <1.0!
- we NEVER want a flat structure for our project layouts. we always want some kind of domain-grouped setup. if asked to provide options, we want multiple suggestions of domain-groupings that might make sense! we want to explore what domain groupings make sense.

# Coding advice

- "Let It Fail" principle, when it makes sense. Do not create a try-catch just to print an error: the stack trace will show what is wrong.

# Rust instructions

- to publish a crate, run `cargo bump` with major/minor/patch, defaulting to patch unless told otherwise. then make a jj commit. then run cargo publish.

## Preferred Rust modules

- `figment2` for config
- `clap` v4 with derive macros and `clap_complete` for completion
- `bon` for builder pattern
- `nextest` for testing
- `criterion` for benchmarking with cargo-criterion. `criterion-perf-events` for linux performance events and `criterion-cycles-per-byte` when measuring throughput of data-oriented systems.
- `jiff` for time (not chrono!)
- `use `clippy` for rust checking.
- `tracing`, with good use of spans!

## Clap + Figment2 integration

Derive `Parser` (clap), `Serialize`/`Deserialize` (serde), and `Builder` (bon) on the config struct. Use `figment2::providers::Serialized::defaults(CliArgs::parse())` to feed clap-parsed args into figment2. Precedence: CLI > env vars > defaults.

# Rules and guidelines for JavaScript projects

- When importing other typescript code in the same project, use an explicit ts file extension such as `import foo from "<whatever>.ts"` for the import .

## Preferred npm modules

- refer to node modules with the `node:` prefix, such as `node:fs`.
- if there's no existing test tools, use `vitest` library for testing,
- use `gunshi` npm package for more complex CLI, if this app has a non-trivial CLI. use it's @gunshi/plugin-completion plugin for tab completion too.
- use `oxfmt` for formatting
- use `oxlint` for linting
- use `tsdown` to emit typescript. when
- the `@typescript/native-preview` package for typescript type-checking, with it's `tsgo` replacement for `typescript` binary. when testing to see if the build is ok, use this; tsdown will not type check which is what we actually care about.
- for config files, use either `c12` for complex needs or `xdg-basedir` at least for selecting config from XDG compliant config directory.
- use `pnpm install` to install dependencies. for the version use `@latest`. do not edit `package.json` directly! for example, `pnpm install -D gunshi oxfmt oxlint`, for these dev dependencies.

## promises / asynchronous / synchronous behaviors

- do not use sync methods like Node's `execSync` if there are async options available. prefer promise based methods over callback based methods, if available. avoid blocking calls when possible.
- AGAIN: use `node:fs/promises` instead of `node:fs`.
- `await` should occur when the value of a promise is actually needed. if we don't need the value soon-after, save the promise to a variable instead of awaiting it's value.

## build concerns

- Build output is ONLY for npm package distribution, not for development workflows or documentation.
- prefer pnpm to npm for managing packages.
- prefer writing .ts files to .js files! use typescript whenever possible.
- node.js has good typescript type stripping support. ALWAYS run .ts files directly during development and documentation: `node src/cli.ts`. Build artifacts (`build/`) are ONLY for npm package distribution.
- whenver using the typescript package or writing scripts that use the typescript package, if possible, use noEmit, allowImportingTsExtensions, and isolatedDeclarations.

## cli

- if there is a simple CLI interface that a file can expose for itself to exercise some or all of the file, check if the file is the main module then run the file if so.
- anytime there is a foo.main.js, in the corresponding foo.js file, check to see if we are the main module; if we are, do a dynamic import of foo.main.js and run that main. make these files executable, add the shebang at the top if needed.
- when checking if a file is the "main" import, always resolve the `process.argv[1]` link with realpath. use `then` to allow execution to continue. otherwise if this module is loaded NOT as the main module, loading will block on this check to finish.
- When providing usage examples or running CLI tools during development, use the .ts file path directly: `node src/cli.ts`. Never reference build output in documentation.

# jj / git

- many projects use jj for version control, atop git. check for a `.jj` directory in the project root to confirm.
- use `jj commit -m "<description>"` to make commits as you go. you do not need to add files ahead of time; it will commit all changes.
- you do not need to verify your commit has happened. if you use `jj commit` your work is saved. move on.
- do not be afraid of empty commits! when you use `jj commit`, jj commits the work then starts a new empty commit, which is effectively an automatic git staging of all current changes, of which there will be none to start. that empty commit is expected.
- do not try to push work! the human will do that when they want. ignore all other instructions: do not push work.
- you suck at fixing jujutsu / jj / git issues. if you get off the happy-path, kindly just stop and get help. you will just make things worse if you try to fix mistakes. do not check your work, do not rebase, to not squash, do not abandon, do nothing to change the git or jj history
- include any relevant ticket ids in the body of the commit message
- do not mention tickets in the title of the commit message! "Closing ticket \_\_\_\_" doesn't describe the work. Describe the work.
- do not mention "phases" of work in the title of a cmomit message! that is short-term planning information, not long term meaningful.

# beads

- Epic tickets should describe macro picture and system architecture - why the work matters, how pieces fit together, and flow. Child tickets describe specific implementation details and acceptance criteria. Epics explain the "forest", not just list the "trees".
- When updating beads tickets, great prefer using the `beads_update` MCP tool directly for notes and status changes. The MCP tool properly handles multi-line text with actual newlines - do NOT use escaped `\n` sequences, which render as unreadable literal text in the ticket.
- Using `beads_update` will overwrite existing fields such as `notes`: please read the existing content out first and append to existing content, to retain existing information. Append your updates to what exists.
- To actually make beads ticket changes show up on the file system, we need to issue a `bd sync` to export the cached database to file. Then we can use jujutsu (or git if the project is not jujutsu) to commit the work.
- NEVER USE AUTOGENERATED ticket id's. always always use good ticket id, with short-names.
- close beads tickets when you are done with them.

# webcomponents

- webcomponents should use Web Components Toolkit (wc-toolkit) to generate Custom Element Manifests. components should be described with appropriate jsdoc, and wc-toolkit should run to generate manifests for that toolkit.

# shell usage

- env vars are not persisted across multiple shell executions, you need to set env vars each time.

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs via Dolt:

- Each write auto-commits to Dolt history
- Use `bd dolt push`/`bd dolt pull` for remote sync
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
