# Experimenting

- when writing files to explore behavior, please use a `.test-agent` folder at the top of the project for temporary files (creating it if needed), so they can be managed & cleaned up effectively.

# Documentation

- please read INDEX files in documentation directories to be aware of what's included in the directory
- `~/wiki/<repo-org>/<repo-name>` has wiki resources describing projects.
- `~/archive/<repo-org>/<repo-name>` is the place for checkouts of projects, `~/src/<repo-name>` or `~/src/<repo-name>-<workspace-name>` for 1st party checkouts

# Project Planning

- do not write time-frames like "days" or "weeks" into plans. your estimates are crude and will not match the actual delivery timelines: leave your time estimates out.
- mermaid diagrams are excellent visual references. use meaningful node identifiers when creating them.
- breaking changes are fine if a project is <1.0!

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
- use `clippy` for rust checking.

# Rules and guidelines for JavaScript projects

- When importing other typescript code in the same project, use an explicit .ts extension for the import statement.

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
- To actually make beads ticket changes show up on the file system, we need to issue a `bd export -o .beads/issues.jsonl` to export the cached database to file. Then we can use jujutsu (or git if the project is not jujutsu) to commit the work.
- NEVER USE AUTOGENERATED ticket id's. always always use good descriptive ticket names, with short-names.

# webcomponents

- webcomponents should use Web Components Toolkit (wc-toolkit) to generate Custom Element Manifests. components should be described with appropriate jsdoc, and wc-toolkit should run to generate manifests for that toolkit.

# shell usage

- env vars are not persisted across multiple shell executions, you need to set env vars each time.
