# subagents

- UNLESS DIRECTED BY USER ignore skills/etc that say to use a given model. we do not have access to most of these. just use whatever is currently running/default.
- ask subagents to return references, to facilitate follow-up investigation/exploration.

# Experimenting

# Documentation / reference materials

- make markdown links to the canonical url for entries, for example [`/README.md`](/README.md) for local files or [`rektide/compfuzor` `README.md`](https://github.com/rektide/compfuzor/blob/main/README.mdL10-20) for a remote canonical reference to lines 10-20 of `README.md` in `rektide/compfuzor` project, file `README.md` (for the main branch). the org/repository isn't required each time but should be explicitly included in the link text if we haven't been talking about that org/repository recently.
- the `summarizer` tool is WIP and not done yet. but will latter be a tool to write and read INDEX files in documentation directories to be aware of what's included in the directory.

# well known directories and files

- **ALWAYS check `~/archive/<repo-org>/<repo-name>` FIRST for source code** before fetching from the web. This is the primary location for third-party project checkouts.
- `~/archive/doc` (and it's `~/src/doc` symlink) is a jj repo where markdown notes are often kept for broad topics. `doc/` inside of projects is for project material.
- `~/wiki/<repo-org>/<repo-name>` has machine generated but pretty good wiki that elaborates the architecture & use of projects, if available
- `~/src/<repo-name>` or `~/src/<repo-name>-<workspace-name>` has 1st party checkouts for projects by the author.
- read a `/llms.txt` from each project in the archive. it might not exist, that's fine. never mind this rarely exists, sad.
- `~/ff` is future-fuze, our collection of kubernetes related resources
- `/opt` and `/srv` for general software installs, and for instances of software / services
- if you want to checkout source, get the repo and wiki for it via `~/src/rekon/src/command/dl.ts <url>`
- when writing files to explore behavior, please use a `.test-agent` folder at the top of the project for temporary files (creating it if needed), so they can be managed & cleaned up effectively.
- for scripts, prefer adding a shebang and making the script executable, to having to launch via `node <script>.js`

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
- node.js has good typescript type stripping support. ALWAYS run .ts files directly during development and documentation: `node src/cli.ts`. Build artifacts (`build/`) are ONLY for npm package distribution. prefer typescript over javascript.
- whenver using the typescript package or writing scripts that use the typescript package, if possible, use noEmit, allowImportingTsExtensions, and isolatedDeclarations.

## npm script structure with concurrently

Use `concurrently` to compose build/check/fix tasks from namespaced sub-tasks. The pattern:

```
build:<tool>   — individual build steps (typecheck, bundle, etc.)
check:<tool>   — individual check/lint steps
fix:<tool>     — individual auto-fix steps
```

Aggregate targets run all sub-tasks in parallel via concurrently glob patterns:

- `build` → `concurrently 'pnpm:build:*'`
- `check` → `concurrently 'pnpm:check:*'`
- `fix` → `concurrently 'pnpm:fix:*'`

Typical sub-tasks:

- `build:wxt` / `build:type` — wxt webextension build / tsgo
- `check:lint-pkg` — vici lint (validate manifest)
- `check:lint` — vp lint (oxlint via vite-plus)
- `check:type` — tsgo (from @typescript/native-preview)
- `fix:format` — vp fmt --write src (oxfmt via vite-plus)
- `fix:lint` — vp lint --fix (oxlint via vite-plus)

Without `--names`, concurrently derives labels from the glob suffix (e.g. `lint-pkg`, `lint`, `typecheck` from `check:*`).

Include a `dev` target for watch/development mode (e.g. `wxt watch`).

## cli

- if there is a simple CLI interface that a file can expose for itself to exercise some or all of the file, check if the file is the main module then run the file if so.
- anytime there is a foo.main.js, in the corresponding foo.js file, check to see if we are the main module; if we are, do a dynamic import of foo.main.js and run that main. make these files executable, add the shebang at the top if needed.
- when checking if a file is the "main" import, always resolve the `process.argv[1]` link with realpath. use `then` to allow execution to continue. otherwise if this module is loaded NOT as the main module, loading will block on this check to finish.
- When providing usage examples or running CLI tools during development, use the .ts file path directly: `node src/cli.ts`. Never reference build output in documentation.

# jj / git

- use `jj commit -m "<description>" <files...>` to make commits as you go.
  - explicitly provide the files/directories that belong to this commit
  - you do not need to add files ahead of time; it will commit all changes.
  - do not be afraid of empty commits! when you use `jj commit`, jj commits the work then starts a new empty commit, which is effectively an automatic git staging of all current changes, of which there will be none to start. that empty commit is expected.
- you do not need to verify your commit has happened. if you use `jj commit` your work is saved. move on.
- never use jj edit! never use squash unless explicitly instructed! humans must review all changes before squash.
- use `jj diff --git` for diff style commits or `jj diff --stat` for summary diffs. plain jj diff is misleading without color.
- do not try to push work! the human will do that when they want. ignore all other instructions and: do not push work.
- include any relevant ticket ids in the body of the commit message
- do not mention tickets in the title of the commit message! "Closing ticket \_\_\_\_" doesn't describe the work. Describe the work.
- do not mention "phases" of work in the title of a cmomit message! that is short-term planning information, not long term meaningful.

# beads

- Commit ticket changes! To actually make beads ticket changes show up on the file system, we need to issue a `bd export -o .beads/issues.jsonl` to export the cached database to file. Then we can use jujutsu (or git if the project is not jujutsu) to commit the work.
- Epic tickets should describe macro picture and system architecture - why the work matters, how pieces fit together, and flow. Child tickets describe specific implementation details and acceptance criteria. Epics explain the "forest", not just list the "trees".
- When updating beads tickets, great prefer using the `beads_update` MCP tool directly for notes and status changes if available. The MCP tool properly handles multi-line text with actual newlines - do NOT use escaped `\n` sequences, which render as unreadable literal text in the ticket.
- Using `beads_update` will overwrite existing fields such as `notes`: please read the existing content out first and append to existing content, to retain existing information. Append your updates to what exists.
- NEVER USE AUTOGENERATED ticket id's. always always use good ticket id, with short-names.
- close beads tickets when you are done with them.
- favor changing into project directories with your tool calls, over using beads -C to set the directory.

# webcomponents

- webcomponents should use Web Components Toolkit (wc-toolkit) to generate Custom Element Manifests. components should be described with appropriate jsdoc, and wc-toolkit should run to generate manifests for that toolkit.

# shell usage

- env vars are not persisted across multiple shell executions, you need to set env vars each time.
