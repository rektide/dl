# `walk` command

> recursve archives (&c) gathering facts on archives

runs arbitrary `fact` collectors on each repo (in archive, src, or wiki), running gathering tools

runs through all files in repo until all facts have been satisfied (or have explicitly terminated)

# cli

launches a single fexec, outputs each row. optional filtering.

# `fexec`

the instance of a fact finding run.

- onlines `facter` instances that will generate facts (`--facters=[...patterns]`)
- uses `starting` generators to add some initial
- feeds starting directory/directories to `dirent` facter, which queues more (`--starting=` flag)
- passes candidate files (and all `wanted` material) to `fact` subroutines, passes all wa
- facts accumulate on each candidate and on each
- intelligent sequencing of facter execution based off declared wants/provides
- comma separated

## fields

| fexec field  | type                         | description                        |
| ------------ | ---------------------------- | ---------------------------------- |
| `facter`     | `facter[]`                   | fact finders                       |
| `starting`   | `starter[]`                  | initial directories to populate    |
| `candidates` | `candidate[]`                | elements processing                |
| `pos`        | `number`, `Iterable<number>` | ordinal(s) of candidates we are on |

| `ctx` | context accumulator |
| `visitCandidate` | accepts a candidate for fact finding | |

- typically it's expected that `candidates` be allowed to grow unbounded, but clearing or removing elements from fexec#candidates should be a non-breaking matter

# generator

## smartgen

# `candidate`

> A tidbit of information that a facter will work on

represents any quanta of data being facted over, often starting with just a filename (and dirent)

| field   | description                          | default |
| ------- | ------------------------------------ | ------- |
| `path`  | full path to candidate               |         |
| `level` | log level verbosity to log line      | `info`  |
| `ctx`   | any facts added are added here first |         |

# facter

individual fact finding subprocesses. accepts aync stream / async generator of things to search for facts. emits all instances of the fact (but typically the `fexec` will deschedule facters after their first result, to economize)

| fact                | description                                 | wants                    | emits |
| ------------------- | ------------------------------------------- | ------------------------ | ----- |
| `rekon-dir`         | `archive` `src` `wiki` or null              |
| `git-last-commit`   | most recent commit on HEAD                  |
| `git-worktree`      | git worktree                                |
| `git-origin`        | git origin                                  |
| `git-branch`        | git branch                                  |
| `jj-branch`         | most recent branch name for changelogs      |
| `jj-workvariant`    | workspace with the project-name de-prefixed |
| `npm-package`       | npm package name                            |
| `cargo-package`     | cargo package name                          | `                        |
| `html-last-updated` | last-indexed extractor                      | `html-walk=last-updated` |       |

| --- | --- | --- |
| `dirwalk` | special facter that does not output until dirwalk is complete, queues first files then directories for any dir walked | dirent |
| `dirent` | special. file then directory (breadth first) walker, attaches dirent to context. |

### facter properties

to help schedule proper of execution of facters, facters provide some information on what they need and what they can facter on

| common fact property | description                                                                                       | values                                  |
| -------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `extensions`         | pattern+ of file extensions to match for this facter                                              |
| `wants`              | flag+ declaring desired info for candidate files                                                  | `data` `dirent` `fd` `json` `html-walk` |
| `emits`              | emits these facts. by default this is null & facter emits only a single value, by it's own name   |
| `querySelectors`     | single query selector or named query selectors to run before executing. asserts `html-walk` want. |

## html-last-indexed

registers a DOM query-selector for configurable last-updated dates. various parsers.

if this fact is active, a

##

# configuration

- facters configurable via xdgox drop in config files in rek-on

of named query selectors with html-rewriter-wasm, and retrieve their content with that name. it spits out a single json of all query selected items, or null if the query selctor didn't have results. report a status line for each. write a freshcheck feature to --filter-date-col=[field] to parse a date from a resulting selected field. then flags to filter by recent / older than date, with time units. freshcheck goes through files in the archive, reading the html files (specified with a file extension flag), and stops running query each query selector after it's first result.
