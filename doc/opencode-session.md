# opencode session storage and recovery

opencode stores session data in SQLite databases under `~/.local/share/opencode/`. Sessions include the full conversation (tool calls, file reads, patches) even when changes were never committed to version control. This makes the database a recovery mechanism for lost work.

## Database layout

```
~/.local/share/opencode/
  opencode.db           # primary database (often the "global" or first project)
  opencode-.db          # project-specific (note the trailing dash)
  opencode-local.db     # another project scope
  opencode-.db-wal      # write-ahead log (live data not yet checkpointed)
  opencode-.db-shm      # shared memory file
  storage/
    session/            # per-session data blobs, keyed by hash directories
    session_diff/       # one JSON file per session with tracked file diffs
    message/            # message-level storage
    part/               # part-level storage
    todo/               # todo items
  snapshot/             # workspace snapshots keyed by commit hash
  tool-output/          # large tool outputs saved to disk
  project/              # per-project configuration
```

### Identifying the right database

Multiple `.db` files can exist. Each corresponds to a different project scope or session. To find which database contains rekon sessions:

```bash
for db in ~/.local/share/opencode/opencode*.db; do
  count=$(sqlite3 "$db" "SELECT count(*) FROM session WHERE directory LIKE '%rekon%'" 2>/dev/null)
  if [ "$count" -gt 0 ]; then
    echo "$db: $count rekon sessions"
  fi
done
```

The database with the most recent sessions is likely the active one. The database named `opencode-.db` (with trailing dash) contained the May 2026 rekon sessions.

## Table structure

### `session` table

Stores session metadata. Key columns:

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Session ID (e.g. `ses_1fbd28fa3ffe2GERBRK4ov3Cpo`) |
| `project_id` | text | Foreign key to project |
| `parent_id` | text | Parent session ID (for fork chains) |
| `slug` | text | URL slug |
| `directory` | text | Working directory path |
| `title` | text | Human-readable session title |
| `version` | text | Schema version |
| `time_created` | integer | Creation timestamp (milliseconds since epoch) |
| `time_updated` | integer | Last update timestamp |
| `summary_additions` | integer | Lines added in session diff |
| `summary_deletions` | integer | Lines deleted in session diff |
| `summary_files` | integer | Files changed in session diff |

### `message` table

One row per message (user turn or assistant turn). Mostly metadata — the actual content lives in the `part` table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Message ID (e.g. `msg_e045e3330001x2Xw5n0ICCEi2r`) |
| `session_id` | text | Foreign key to session |
| `time_created` | integer | Timestamp (ms) |
| `data` | text | JSON blob with `role`, `time`, `agent`, `model`, `summary` |

### `part` table

The important one. Each message is broken into parts containing the actual content: text, reasoning, tool calls with full inputs and outputs.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Part ID (e.g. `prt_e04735f92001ZDm6ahYjrl0nSd`) |
| `message_id` | text | Foreign key to message |
| `session_id` | text | Foreign key to session |
| `time_created` | integer | Timestamp (ms) |
| `data` | text | JSON blob with type-specific content |

Part `data` has a `type` field that determines the shape:

- **`text`** — plain text content. Fields: `text`, optional `synthetic` (true for auto-generated tool-result summaries).
- **`reasoning`** — model thinking/reasoning. Fields: `text`.
- **`tool`** — tool call with input/output. Fields: `tool`, `callID`, `state` (containing `status`, `input`, `output`).

Tool call example (truncated):

```json
{
  "type": "tool",
  "tool": "apply_patch",
  "callID": "call_qeg2gL7fFXJBVUcPl6uhUkZS",
  "state": {
    "status": "completed",
    "input": {
      "patchText": "*** Begin Patch\n*** Add File: /path/to/file.ts\n+export const foo = 1;\n*** End Patch"
    },
    "output": "Success. Updated the following files:\n A src/path/to/file.ts"
  }
}
```

### `session_diff` JSON files

Stored at `~/.local/share/opencode/storage/session_diff/{session_id}.json`. Each file is a JSON array of objects:

```json
[
  {
    "file": "src/planner/intent.ts",
    "patch": "Index: src/planner/intent.ts\n===================================================================\n--- /dev/null\n+++ src/planner/intent.ts\n@@ -0,0 +1,42 @@\n...",
    "additions": 42,
    "deletions": 0,
    "status": "added"
  }
]
```

Status values: `added`, `deleted`, `modified`.

## Session diffs vs raw parts

This distinction matters for recovery.

**Session diffs** (`session_diff/` JSON files) capture changes that opencode tracked as file modifications. These roughly correspond to what was committed to version control. If work was done in the working directory but never committed, the session diff might be empty or only contain documentation changes.

**Raw parts** (the `part` table) contain every tool interaction: every `apply_patch` call, every file read, every bash command. This includes uncommitted working directory changes. When a session created files that were never committed, the full file contents are still in the `part` table as `apply_patch` inputs.

Example: session `ses_1fba1ccd1ffeFg1Mjcq57DVDpQ` ("Phase 3 architecture gap assessment") has a session diff showing only 3 documentation files changed. But the `part` table contains 134 messages and 578 parts, including `apply_patch` calls that created `intent.ts`, `intent.test.ts`, `plan.ts`, `plan.test.ts`, `view/handler.ts`, and `view/plugin.ts` — all uncommitted working directory changes.

**For recovery, always check both.** Session diffs for committed changes, part table for everything.

## Finding sessions

### List sessions for a project

```bash
DB=~/.local/share/opencode/opencode-.db

sqlite3 "$DB" "
SELECT id, title,
       datetime(time_created/1000, 'unixepoch', 'localtime') as created,
       datetime(time_updated/1000, 'unixepoch', 'localtime') as updated,
       summary_files as files,
       summary_additions as additions,
       summary_deletions as deletions
FROM session
WHERE directory LIKE '%rekon%'
ORDER BY time_created DESC
LIMIT 20
"
```

### Find sessions by title keyword

```bash
sqlite3 "$DB" "
SELECT id, title, datetime(time_created/1000, 'unixepoch', 'localtime') as created
FROM session
WHERE title LIKE '%planner%'
ORDER BY time_created
"
```

### Find sessions that touched specific files

Search the `part` table for tool calls referencing a file:

```bash
sqlite3 "$DB" "
SELECT DISTINCT p.session_id, s.title,
       datetime(s.time_created/1000, 'unixepoch', 'localtime') as created
FROM part p
JOIN session s ON s.id = p.session_id
WHERE p.data LIKE '%intent.ts%'
ORDER BY s.time_created
"
```

### Get session metadata

```bash
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'

sqlite3 "$DB" "
SELECT title,
       datetime(time_created/1000, 'unixepoch', 'localtime') as created,
       datetime(time_updated/1000, 'unixepoch', 'localtime') as updated,
       summary_files as files,
       summary_additions as '+',
       summary_deletions as '-'
FROM session WHERE id = '$SESSION_ID'
"

# Message and part counts
sqlite3 "$DB" "
SELECT
  (SELECT count(*) FROM message WHERE session_id = '$SESSION_ID') as messages,
  (SELECT count(*) FROM part WHERE session_id = '$SESSION_ID') as parts
"
```

### Find sessions in a time range

```bash
# May 7, 2026 (UTC)
START_MS=1746566400000  # 2026-05-07 00:00:00 UTC
END_MS=1746652800000    # 2026-05-08 00:00:00 UTC

sqlite3 "$DB" "
SELECT id, title,
       datetime(time_created/1000, 'unixepoch', 'localtime') as created,
       datetime(time_updated/1000, 'unixepoch', 'localtime') as updated
FROM session
WHERE time_created BETWEEN $START_MS AND $END_MS
ORDER BY time_created
"
```

## Reconstructing work

### Extract the patch list from a session diff

```bash
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'
DIFF_FILE=~/.local/share/opencode/storage/session_diff/${SESSION_ID}.json

python3 -c "
import json
with open('$DIFF_FILE') as f:
    data = json.load(f)
for diff in sorted(data, key=lambda d: d.get('file','')):
    path = diff.get('file', 'unknown')
    additions = diff.get('additions', 0)
    deletions = diff.get('deletions', 0)
    status = diff.get('status', '')
    print(f'{status:8s} {path} (+{additions}/-{deletions})')
"
```

### Extract file contents from tool call inputs

When a file was created via `apply_patch`, the full content is in the part's `data` field. Extract it:

```bash
SESSION_ID='ses_1fba1ccd1ffeFg1Mjcq57DVDpQ'
TARGET_FILE='intent.ts'

sqlite3 "$DB" "
SELECT id FROM part
WHERE session_id = '$SESSION_ID'
  AND data LIKE '%Add File%'
  AND data LIKE '%${TARGET_FILE}%'
ORDER BY time_created
" | while read part_id; do
  sqlite3 "$DB" "SELECT data FROM part WHERE id = '$part_id'" > /tmp/patch_raw.json
  python3 -c "
with open('/tmp/patch_raw.json') as f:
    raw = f.read()
start = raw.find('*** Begin Patch')
if start >= 0:
    end = raw.find('*** End Patch', start) + len('*** End Patch')
    patch_text = raw[start:end]
    # Convert escaped newlines to real newlines
    print(patch_text.replace('\\\\n', '\n'))
"
done
```

The patch text uses `\n` as literal escape sequences. Convert them to get the actual file content by stripping the patch header and `+` prefixes:

```bash
python3 -c "
with open('/tmp/patch_raw.json') as f:
    raw = f.read()
start = raw.find('*** Begin Patch')
end = raw.find('*** End Patch', start) + len('*** End Patch')
patch_text = raw[start:end].replace('\\\\n', '\n')
# Extract lines starting with + and strip the prefix
lines = patch_text.split('\n')
for line in lines:
    if line.startswith('+') and not line.startswith('+++'):
        print(line[1:])
"
```

### List all files created in a session

```bash
SESSION_ID='ses_1fba1ccd1ffeFg1Mjcq57DVDpQ'

sqlite3 "$DB" "
SELECT DISTINCT substr(
    json_extract(data, '$.state.input.patchText'),
    instr(json_extract(data, '$.state.input.patchText'), '*** Add File: ') + 14,
    instr(substr(json_extract(data, '$.state.input.patchText'),
         instr(json_extract(data, '$.state.input.patchText'), '*** Add File: ') + 14),
         '\\\\n') - 1
) as created_file
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.tool') = 'apply_patch'
  AND data LIKE '%Add File%'
ORDER BY created_file
"
```

Or more reliably with python:

```bash
python3 -c "
import sqlite3, json
db = sqlite3.connect('$DB')
cursor = db.execute('''
    SELECT data FROM part
    WHERE session_id = '$SESSION_ID'
      AND data LIKE '%apply_patch%'
      AND data LIKE '%Add File%'
    ORDER BY time_created
''')
for row in cursor:
    data = json.loads(row[0])
    patch = data.get('state', {}).get('input', {}).get('patchText', '')
    for line in patch.split('\\\\n'):
        if line.startswith('*** Add File: '):
            print(line[14:])
"
```

### Identify uncommitted vs committed work

Compare the session diff files against what the `part` table shows:

```bash
SESSION_ID='ses_1fba1ccd1ffeFg1Mjcq57DVDpQ'

echo "=== Session diff (committed/tracked) ==="
DIFF=~/.local/share/opencode/storage/session_diff/${SESSION_ID}.json
if [ -f "$DIFF" ]; then
  python3 -c "
import json
with open('$DIFF') as f:
    for d in json.load(f):
        print(f\"{d['status']:8s} {d['file']} (+{d['additions']}/-{d['deletions']})\")
"
else
  echo "(no session diff file)"
fi

echo ""
echo "=== Part table tool calls (all interactions) ==="
sqlite3 "$DB" "
SELECT count(*) FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.tool') = 'apply_patch'
"
```

If the session diff shows 3 files but the part table has 20+ `apply_patch` calls, the remaining work was uncommitted.

### Follow fork chains

Sessions can fork. The title usually indicates the fork number ("fork #1", "fork #2"). Forks often share overlapping timestamps because opencode creates them as parallel branches.

```bash
sqlite3 "$DB" "
SELECT id, title,
       datetime(time_created/1000, 'unixepoch', 'localtime') as created,
       datetime(time_updated/1000, 'unixepoch', 'localtime') as updated,
       summary_files as files
FROM session
WHERE title LIKE '%Phase 3 action stages%'
ORDER BY time_created
"
```

The longest-running fork with the most file changes is usually the one that contains the actual implementation. Shorter forks (same created/updated timestamp) are often abandoned attempts.

## Recovery workflow

### Step 1: Find relevant sessions

```bash
DB=~/.local/share/opencode/opencode-.db

# Find all sessions that mention the work
sqlite3 "$DB" "
SELECT id, title,
       datetime(time_created/1000, 'unixepoch', 'localtime') as created,
       datetime(time_updated/1000, 'unixepoch', 'localtime') as updated,
       summary_files as files
FROM session
WHERE title LIKE '%<keyword>%'
   OR directory LIKE '%<project>%'
ORDER BY time_created
"
```

### Step 2: Determine chronological order and dependencies

List sessions by creation time. Identify:

1. **Design sessions** — short duration, few file changes, titles like "assessment" or "planning".
2. **Implementation sessions** — long duration, many file changes, titles like "architecture" or "refactoring".
3. **Fork chains** — same base title with "(fork #N)" suffixes. The highest fork number isn't always the one to use; check which has the most changes and ran longest.

Check dependencies by looking at which files each session expects to exist vs. which it creates:

```bash
# Files CREATED by a session (from part table apply_patch calls)
# Files READ by a session (from part table read tool calls)
```

### Step 3: Extract patches in order

For each session in chronological order:

1. Check the session diff file first — it has clean, git-compatible patches.
2. If the session diff is missing work, extract patches from the `part` table.
3. Save each session's patches to numbered files for ordered application.

```bash
# Export session diff patches
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'
DIFF=~/.local/share/opencode/storage/session_diff/${SESSION_ID}.json

python3 -c "
import json
with open('$DIFF') as f:
    data = json.load(f)
for i, diff in enumerate(data):
    patch = diff.get('patch', '')
    with open(f'/tmp/session_{SESSION_ID[:12]}_{i:03d}.patch', 'w') as out:
        out.write(patch)
    print(f'{diff[\"status\"]:8s} {diff[\"file\"]} -> /tmp/session_{SESSION_ID[:12]}_{i:03d}.patch')
"
```

### Step 4: Apply to the codebase

For session diffs in git-compatible format:

```bash
# Apply a single patch
git apply /tmp/session_1fbd28fa3ff_000.patch

# Or apply all patches from a session
for patch in /tmp/session_1fbd28fa3ff_*.patch; do
  git apply "$patch" || echo "FAILED: $patch"
done
```

For work extracted from the `part` table (uncommitted changes), reconstruct the files from the `apply_patch` inputs and write them directly.

### Pitfalls

- **Multiple databases.** Always identify which `.db` file has your project's sessions. The wrong database returns zero results.
- **Session diffs miss uncommitted work.** A session that made extensive code changes might show only doc changes in its session diff if the code was never committed to jj/git.
- **Fork ordering.** Forks can overlap in time. Don't assume fork #3 includes fork #1's work. Check each fork's file list independently.
- **Timestamps are milliseconds.** SQLite `datetime()` needs division by 1000: `datetime(time_created/1000, 'unixepoch', 'localtime')`.
- **JSON escaping.** Part `data` contains embedded JSON with escaped newlines (`\n` as literal `\\n`). Python's `json.loads()` handles this, but string slicing on the raw text requires care.
- **Part data can be large.** A single part can contain thousands of lines of file content. Use `substr()` or `length()` in SQL to preview before extracting.

---

# Phase A recovery guide

This section is a comprehensive guide for a future agent to re-implement the work done in Phase A — a massive architectural refactor that was lost when jj/git history was reset. The goal is NOT to mechanically replay diffs. The goal is for the agent to **understand what was done and why**, then implement equivalent changes fresh against whatever the current codebase looks like.

## Phase A overview and goals

### Session identity

- **Session ID**: `ses_1fbd28fa3ffe2GERBRK4ov3Cpo`
- **Title**: "Phase 3 action stages architecture (fork #1)"
- **Date**: May 7, 2026, 16:42–17:33 (about 51 minutes)
- **Scale**: 74 files, +13,628/-3,920 lines
- **Database**: `~/.local/share/opencode/opencode-.db`
- **Session diff**: `~/.local/share/opencode/storage/session_diff/ses_1fbd28fa3ffe2GERBRK4ov3Cpo.json` (665KB, 74 file entries)
- **Parts**: 539 parts across 112 messages (175 tool calls, 97 reasoning blocks, 37 text blocks)

### What Phase A achieved architecturally

Phase A replaced the legacy action execution system with a planner-driven action stages architecture. The old system converted `Repo` objects into `RepoContext`, then ran a separate `runPipeline()` of `ActionHandler`s. Phase A eliminated that bridge entirely.

The new architecture keeps three concerns separated:

1. **Flow runtime** resolves repo streams (candidates, verification, deduplication).
2. **Planner** assembles what a specific command invocation does with those repos — which actions to run, in what stage order, with what state.
3. **Action plugins** register their own actions into the planner. The planner lowers action bindings into flow stages.

The key insight: **stages define order; actions define outcomes**. Actions are not themselves stream stages. The planner lowers action bindings (concrete records that say "run this action at this stage in this invocation") into flow stages.

### Vocabulary changes

Phase A renamed types and concepts throughout the codebase:

| Old name | New name | What it means |
|----------|----------|---------------|
| `ActionCapability` | `ActionCapability` (kept) | A plugin's contribution: spec + assembly function |
| `ActionExecutionContext` | `ActionExecutionContext` (kept) | Runtime context passed to binding runners |
| `ActionOverride` | `ActionOverride` (kept) | Explicit CLI override for a specific action |
| `DlActionSpec` | `ActionSpec` | Declaration of an action's name, states, and CLI option |
| `DlOptions` | `RunOptions` | Runtime options for the planner |
| `RepoContext` | eliminated | The `Repo → RepoContext` bridge was removed entirely |
| `runPipeline()` | eliminated | Actions now run through the stage composition system |
| `ActionHandler` | eliminated (handlers still exist but don't implement a shared handler interface) | |
| `ActionPipeline` | eliminated | |
| `ActionRegistry` | eliminated | |
| `plugin/dl-actions.ts` | `planner/plugin.ts` | Plugin that aggregates action contributions |
| `command/run.ts` | eliminated | Its responsibilities moved to the planner |

Plugin IDs: all `dl:` and `rekon:` prefixes were dropped.

### Files deleted

These files were deleted entirely during Phase A:

```
src/action/handler.ts       — ActionHandler interface
src/action/pipeline.ts      — runPipeline() execution
src/action/registry.ts      — ActionRegistry with DlActionSpec
src/action/registry.test.ts — registry tests
src/action/types.ts         — DlOptions, DlRunCtx, RepoContext
src/command/run.ts          — runFlowCommand (legacy flow runner)
src/command/run.test.ts     — tests for legacy flow runner
src/plugin/dl-actions.ts    — old action plugin
src/plugin/repo.ts          — RepoContext creation bridge
```

Additionally, Phase A deleted the entire `src/repo/provider/` directory (crates-io, docs-rs, generic, github, githubio, gitlab, npmx-dev, tangled — both implementations and tests) and `src/repo/` infrastructure files (context.ts, context.test.ts, registry.ts, resolve.ts, types.ts, base/host-repo.ts, base/host-repo.test.ts, base/redirect-repo.ts). These providers already existed in `src/provider/` — the `src/repo/provider/` directory was the old location.

### Files created (new planner subsystem)

```
src/planner/types.ts     — ActionSpec, Binding, ActionCapability, ActionExecutionContext, stages, RunOptions, Services, etc.
src/planner/args.ts      — Functional core: resolve action states from CLI args/tokens
src/planner/args.test.ts — Tests for args resolution
src/planner/plugin.ts    — Imperative shell: gunshi plugin that aggregates action contributions, resolves states, creates bindings
src/planner/stages.ts    — Imperative shell: creates Stage<Repo, FlowContext> from bindings
src/planner/run-state.ts — Per-repo error tracking and facts bag
src/planner/bindings.test.ts — Tests for binding assembly
```

### Files modified (major groups)

**Handlers** — updated to use new vocabulary, accept `ActionExecutionContext` instead of `RepoContext`:
```
src/archive/handler.ts, src/archive/plugin.ts, src/archive/sync.ts
src/archlist/handler.ts, src/archlist/plugin.ts, src/archlist/sync.ts
src/deepwiki/handler.ts, src/deepwiki/plugin.ts
src/wiki/handler.ts, src/wiki/plugin.ts, src/wiki/sync.ts
src/symlink/handler.ts, src/symlink/plugin.ts, src/symlink/sync.ts
src/dexport/sync.ts, src/dexport/types.ts
```

**Commands** — simplified to use planner instead of direct action invocation:
```
src/command/context.ts, src/command/dl.ts, src/command/archive.ts
src/command/archlist.ts, src/command/deepwiki.ts, src/command/symlink.ts
src/command/wiki.ts
```

**Plugins** — updated to contribute actions through new extension point:
```
src/plugin/flow.ts, src/plugin/index.ts, src/plugin/git.ts
src/plugin/dexport.ts, src/plugin/log.ts, src/plugin/roots.ts
src/plugin/input-clipboard.ts, src/plugin/input-positional.ts, src/plugin/input-watch.ts
```

**Tests** — updated lifecycle test to match new types:
```
src/action/lifecycle.test.ts, src/action/lifecycle.ts, src/repo/clean-url.test.ts
```

**Documentation**:
```
doc/phase3-arch.md — architecture document (added)
doc/phase3-direction.md — design direction notes (added)
doc/fancy-graph.md — mermaid diagrams (added)
```

### The Maven-like model

Phase A introduced a Maven-inspired lifecycle model:

| Stage name | Purpose |
|------------|---------|
| `proposed` | After candidate repos are produced, before dedup |
| `verified` | After verification, before actions |
| `catalog` | Action stage: inventory what exists |
| `materialize` | Action stage: download/create resources |
| `document` | Action stage: generate documentation |
| `link` | Action stage: create symlinks |
| `report` | Final stage: report results |

Actions bind to stages. The planner resolves which bindings are active for this invocation based on CLI args and action states.

### The Binding record

The central data structure is `Binding`:

```typescript
type Binding = Readonly<{
  id: string;
  kind: BindingKind;        // "view" | "action" | "stage"
  plugin: string;
  stage: StageName;
  state: string;
  run(ctx: ActionExecutionContext): Promise<ActionResult | void>;
}>;
```

Each action plugin contributes `ActionCapability` objects (spec + assembly function). The planner collects all capabilities, resolves their states from CLI args, and calls `assemble()` on each active one. The assembly function receives an `ActionAssemblyContext` with `args` and `assembly`, and calls `assembly.bind(binding)` to register bindings.

## How to read the Phase A session

### Part type breakdown

The session has 539 parts with this type distribution:

| Part type | Count | What it contains |
|-----------|-------|------------------|
| `tool` | 175 | Tool calls with full inputs and outputs |
| `step-start` | 101 | Subagent step markers |
| `step-finish` | 100 | Subagent step completion markers |
| `reasoning` | 97 | Agent thinking/reasoning (design decisions!) |
| `text` | 37 | User messages and assistant responses |
| `patch` | 25 | File patch operations |
| `file` | 3 | File operation markers |
| `compaction` | 1 | Context compaction marker |

### Tool call breakdown

| Tool | Count | Purpose |
|------|-------|---------|
| `read` | 82 | Agent reading files to understand codebase |
| `bash` | 27 | Running tests, typecheck, lint, git commands |
| `apply_patch` | 22 | Creating/updating/deleting files |
| `skill` | 13 | Loading skills for workflow guidance |
| `grep` | 12 | Searching for patterns in codebase |
| `todowrite` | 10 | Tracking tasks |
| `glob` | 6 | Finding files by pattern |
| `task` | 2 | Delegating to subagents |
| `question` | 1 | Asking user a clarifying question |

### Chronological reading: get all parts in order

```bash
DB=~/.local/share/opencode/opencode-.db
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'

# All parts in chronological order with type and preview
sqlite3 "$DB" "
SELECT id, time_created,
       json_extract(data, '$.type') as type,
       CASE
         WHEN json_extract(data, '$.type') = 'tool' THEN json_extract(data, '$.tool')
         ELSE json_extract(data, '$.type')
       END as label,
       substr(
         CASE
           WHEN json_extract(data, '$.type') = 'text' THEN json_extract(data, '$.text')
           WHEN json_extract(data, '$.type') = 'reasoning' THEN json_extract(data, '$.text')
           WHEN json_extract(data, '$.type') = 'tool' THEN json_extract(data, '$.tool')
           ELSE ''
         END, 1, 120) as preview
FROM part
WHERE session_id = '$SESSION_ID'
ORDER BY time_created
" | head -100
```

### Get all reasoning/thinking parts (design decisions)

The 97 reasoning blocks contain the agent's design thinking. These are the most valuable parts for understanding WHY decisions were made:

```bash
DB=~/.local/share/opencode/opencode-.db
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'

# All reasoning parts with non-empty text, in order
sqlite3 "$DB" "
SELECT id, time_created, json_extract(data, '$.text') as reasoning
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.type') = 'reasoning'
  AND length(json_extract(data, '$.text')) > 10
ORDER BY time_created
"
```

Key reasoning themes you'll find:

1. **Early exploration** (parts starting ~1778186547306): Agent considering codebase investigation approach, assessing flow plugin architecture, understanding the current seams in `runFlowCommand` and stage composition.
2. **Vocabulary pressure** (~1778186957142): Agent and user wrestling with naming — stages vs actions vs phases, Maven model analogy, planner as compiler-like thing.
3. **Bottom-up assembly** (~1778187625553): User's desire for plugins to self-register actions, dispersing `runFlowCommand` responsibilities, initialization/assembly phase design.
4. **Implementation planning** (~1778188184055): Agent committing to forward architecture changes, choosing to remove old pipeline rather than carry compatibility adapters.
5. **Per-file implementation decisions** (~1778188270455–1778188618781): Agent thinking through each file as it modifies them, handling import rewrites, updating tests.

### Get all text parts (conversation)

```bash
DB=~/.local/share/opencode/opencode-.db
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'

# Non-synthetic text parts (actual conversation)
sqlite3 "$DB" "
SELECT id, time_created, json_extract(data, '$.text') as text
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.type') = 'text'
  AND (json_extract(data, '$.synthetic') IS NULL OR json_extract(data, '$.synthetic') = 0)
ORDER BY time_created
"
```

The conversation flow:

1. User describes the goal: move actions to new architecture, wants help shaping the design.
2. Agent assesses codebase, identifies the architectural tension: `verifiedStages` seam exists but `flowPlugin` only exposes observers.
3. Agent proposes option #2: bounded contribution system for actions only, not full flow graph.
4. User accepts option #2, wants specific design discussion.
5. User proposes `planner` name, wants Maven-like stages, clear distinction between stages and actions.
6. Agent and user refine vocabulary: stages = order, actions = results, bindings = concrete records.
7. User says: build it, drop prefixes, use FCIS, keep subsystem separation, breaking changes OK.
8. Agent implements (22 apply_patch calls).
9. Agent runs verification: typecheck, tests, lint, build.
10. User asks for commit and documentation.

### Get all apply_patch parts in order

```bash
DB=~/.local/share/opencode/opencode-.db
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'

# All apply_patch operations with file targets
python3 -c "
import sqlite3, json
db = sqlite3.connect('$DB')
cursor = db.execute('''
    SELECT id, time_created, data
    FROM part
    WHERE session_id = '$SESSION_ID'
      AND json_extract(data, '\$.tool') = 'apply_patch'
    ORDER BY time_created
''')
for row in cursor:
    part_id, ts, raw = row
    data = json.loads(raw)
    patch = data.get('state', {}).get('input', {}).get('patchText', '')
    status = data.get('state', {}).get('status', '?')
    # Extract file operations
    for line in patch.split('\n'):
        if any(line.startswith(f'*** {op}: ') for op in ['Add File', 'Update File', 'Delete File']):
            filepath = line.split(': ', 1)[1] if ': ' in line else '?'
            # Strip repo root
            prefix = '/home/rektide/src/rekon/'
            if filepath.startswith(prefix):
                filepath = filepath[len(prefix):]
            print(f'{ts}  {status:10s}  {line.split(\"*** \")[1].split(\": \")[0]:12s}  {filepath}')
            break
"
```

### Get all file reads in order

```bash
DB=~/.local/share/opencode/opencode-.db
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'

# All file reads, showing what the agent was looking at
sqlite3 "$DB" "
SELECT id, time_created,
       json_extract(data, '$.state.input.filePath') as filepath
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.tool') = 'read'
  AND json_extract(data, '$.state.input.filePath') IS NOT NULL
ORDER BY time_created
"
```

## How to read file contents the agent produced

### Reconstruct the final state of a file

Files may have been modified multiple times (e.g., `src/planner/types.ts` was patched 4 times). To get the final version, you need to apply all patches in order, starting from the file's original state.

For files that were **created** (`*** Add File`), the first patch contains the full content. Subsequent `*** Update File` patches modify it. The session diff JSON file has the final combined patch for each file.

**Method 1: Use the session diff** (recommended for getting final file states):

The session diff at `~/.local/share/opencode/storage/session_diff/ses_1fbd28fa3ffe2GERBRK4ov3Cpo.json` contains git-compatible unified diffs for all 74 files. For `added` files, the diff contains the complete file content. For `modified` files, it shows changes against the pre-Phase-A baseline.

```bash
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'
DIFF_FILE=~/.local/share/opencode/storage/session_diff/${SESSION_ID}.json

# Extract a specific file's final content (for 'added' files)
python3 -c "
import json
with open('$DIFF_FILE') as f:
    data = json.load(f)

# Find the file
target = 'src/planner/types.ts'
for entry in data:
    if entry['file'] == target and entry['status'] == 'added':
        # The patch contains the full file content in unified diff format
        # Lines starting with + (after the --- / +++ header) are the content
        lines = entry['patch'].split('\n')
        for line in lines:
            if line.startswith('+') and not line.startswith('+++'):
                print(line[1:])
            elif line.startswith('@@'):
                pass  # skip hunk headers
            elif not line.startswith('-') and not line.startswith('Index') and not line.startswith('==='):
                pass  # context lines in unified diff
        break
"
```

**Method 2: Extract from part table** (for when session diff is incomplete):

```bash
DB=~/.local/share/opencode/opencode-.db
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'

# Get the LAST apply_patch for a specific file (most recent version)
python3 -c "
import sqlite3, json
db = sqlite3.connect('$DB')
cursor = db.execute('''
    SELECT data
    FROM part
    WHERE session_id = '$SESSION_ID'
      AND json_extract(data, '\$.tool') = 'apply_patch'
      AND data LIKE '%src/planner/types.ts%'
    ORDER BY time_created DESC
    LIMIT 1
''')
for row in cursor:
    data = json.loads(row[0])
    patch = data.get('state', {}).get('input', {}).get('patchText', '')
    # For 'Add File' patches, extract the full content
    print(patch)
"
```

### List every file the session created, modified, or deleted

```bash
DB=~/.local/share/opencode/opencode-.db
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'

python3 -c "
import sqlite3, json
db = sqlite3.connect('$DB')
cursor = db.execute('''
    SELECT time_created, data
    FROM part
    WHERE session_id = '$SESSION_ID'
      AND json_extract(data, '\$.tool') = 'apply_patch'
    ORDER BY time_created
''')

file_ops = {}
for row in cursor:
    data = json.loads(row[1])
    patch = data.get('state', {}).get('input', {}).get('patchText', '')
    for line in patch.split('\n'):
        for op in ['Add File', 'Update File', 'Delete File']:
            prefix = f'*** {op}: '
            if line.startswith(prefix):
                filepath = line[len(prefix):]
                if filepath.startswith('/home/rektide/src/rekon/'):
                    filepath = filepath[len('/home/rektide/src/rekon/'):]
                file_ops.setdefault(filepath, []).append((op, row[0]))
                break

# Group by final operation
created = sorted(f for f, ops in file_ops.items() if any(o == 'Add File' for o, _ in ops))
modified = sorted(f for f, ops in file_ops.items() if all(o == 'Update File' for o, _ in ops))
deleted = sorted(f for f, ops in file_ops.items() if any(o == 'Delete File' for o, _ in ops))

print('=== CREATED ===')
for f in created:
    print(f'  {f} ({len(file_ops[f])} patches)')

print()
print('=== MODIFIED ===')
for f in modified:
    print(f'  {f} ({len(file_ops[f])} patches)')

print()
print('=== DELETED ===')
for f in deleted:
    print(f'  {f}')
"
```

### Get all tool calls of a specific type

```bash
DB=~/.local/share/opencode/opencode-.db
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'

# All bash commands run during the session
sqlite3 "$DB" "
SELECT id, time_created,
       json_extract(data, '$.state.input.command') as command,
       json_extract(data, '$.state.status') as status
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.tool') = 'bash'
ORDER BY time_created
"
```

```bash
# All grep searches
sqlite3 "$DB" "
SELECT id, time_created,
       json_extract(data, '$.state.input.pattern') as pattern,
       json_extract(data, '$.state.input.include') as include
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.tool') = 'grep'
ORDER BY time_created
"
```

## Verification approach

### What the Phase A agent verified

The agent ran these checks before declaring completion:

1. **Type checking**: `pnpm typecheck` (using tsgo from `@typescript/native-preview`)
2. **Tests**: `pnpm test --run` — 17 files, 151 tests, ~420ms
3. **Linting**: `pnpm lint` — warnings only (pre-existing), no errors
4. **Formatting**: oxfmt on changed files
5. **Build**: `pnpm build` — successful

### What tests existed

From the session, the test landscape was:

| Test file | What it tests |
|-----------|---------------|
| `src/planner/args.test.ts` | Args resolution: inline action states, explicit flags, overrides, default behavior |
| `src/planner/bindings.test.ts` | Binding assembly: plugin contributes capabilities, planner resolves states and creates bindings |
| `src/action/lifecycle.test.ts` | Lifecycle reporter: ok/skipped/failed records, summary construction |
| `src/repo/clean-url.test.ts` | URL cleaning utilities |
| Various `src/provider/*.test.ts` | Provider-specific tests |
| Various `src/execute/*.test.ts` | Executor and async queue tests |

### How a future agent should verify its re-implementation

1. **Architectural verification** (not byte-for-byte):
   - Does `src/action/handler.ts` no longer exist?
   - Does `src/action/pipeline.ts` no longer exist?
   - Does `src/action/registry.ts` no longer exist?
   - Does `src/action/types.ts` no longer exist?
   - Does `src/plugin/dl-actions.ts` no longer exist?
   - Does `src/plugin/repo.ts` no longer exist?
   - Does `src/command/run.ts` no longer exist?
   - Does `src/repo/provider/` no longer exist?
   - Does `src/planner/` exist with types.ts, args.ts, plugin.ts, stages.ts, run-state.ts?

2. **Type system verification**:
   - `ActionSpec` is defined in `src/planner/types.ts` with `name`, `description`, `defaultState`, `states`, optional `optionKey`
   - `Binding` has `id`, `kind`, `plugin`, `stage`, `state`, and a `run()` function
   - `ActionExecutionContext` has `repo`, `flow`, `binding`, `stage`, `state`, `args`, `services`, `facts`, `report`, `markError`
   - `ActionCapability` has `spec` and `assemble(ctx)`
   - No `DlOptions`, `DlRunCtx`, `DlActionSpec`, or `RepoContext` types remain

3. **Handler verification**: Each handler (archive, wiki, deepwiki, archlist, symlink) should:
   - Accept `ActionExecutionContext` (not `RepoContext`)
   - Import from planner types (not action/types)
   - Contribute through action plugin extension

4. **Command verification**: Commands should:
   - Use planner infrastructure
   - Not import from deleted modules
   - Not reference `runFlowCommand` directly

5. **Functional verification**:
   - `pnpm typecheck` passes
   - `pnpm test` passes
   - `pnpm build` passes

### Extracting test expectations from the session

To see what the agent's tests expected:

```bash
DB=~/.local/share/opencode/opencode-.db
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'

# Get the test file contents (from the 'added' entries in session diff)
python3 -c "
import json
with open('$HOME/.local/share/opencode/storage/session_diff/ses_1fbd28fa3ffe2GERBRK4ov3Cpo.json') as f:
    data = json.load(f)
for entry in data:
    if entry['status'] == 'added' and 'test' in entry['file']:
        print(f'=== {entry[\"file\"]} ({entry[\"additions\"]} lines) ===')
        # Extract test content from the unified diff
        lines = entry['patch'].split('\n')
        for line in lines:
            if line.startswith('+') and not line.startswith('+++'):
                print(line[1:])
        print()
"
```

## Practical queries a future agent will need

All queries assume these variables are set:

```bash
DB=~/.local/share/opencode/opencode-.db
SESSION_ID='ses_1fbd28fa3ffe2GERBRK4ov3Cpo'
```

### 1. Get all reasoning parts in order (design decisions)

```bash
sqlite3 "$DB" "
SELECT json_extract(data, '$.text') as reasoning
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.type') = 'reasoning'
  AND length(json_extract(data, '$.text')) > 10
ORDER BY time_created
"
```

### 2. Get all apply_patch operations in order (what was changed)

```bash
python3 -c "
import sqlite3, json
db = sqlite3.connect('$DB')
cursor = db.execute('''
    SELECT time_created, data
    FROM part
    WHERE session_id = '$SESSION_ID'
      AND json_extract(data, '\$.tool') = 'apply_patch'
    ORDER BY time_created
''')
for row in cursor:
    data = json.loads(row[1])
    patch = data.get('state', {}).get('input', {}).get('patchText', '')
    for line in patch.split('\n'):
        if any(line.startswith(f'*** {op}: ') for op in ['Add File', 'Update File', 'Delete File']):
            print(f'{row[0]}  {line}')
            break
"
```

### 3. Get all file reads in order (what the agent was looking at)

```bash
sqlite3 "$DB" "
SELECT time_created,
       json_extract(data, '$.state.input.filePath') as filepath
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.tool') = 'read'
  AND json_extract(data, '$.state.input.filePath') IS NOT NULL
ORDER BY time_created
"
```

### 4. Get the final version of a specific file

For files that were `added` (created from scratch), extract from the session diff:

```bash
python3 -c "
import json
with open('$HOME/.local/share/opencode/storage/session_diff/ses_1fbd28fa3ffe2GERBRK4ov3Cpo.json') as f:
    data = json.load(f)
target = 'src/planner/types.ts'  # change this
for entry in data:
    if entry['file'] == target:
        print(f'Status: {entry[\"status\"]}')
        print(f'Changes: +{entry[\"additions\"]}/-{entry[\"deletions\"]}')
        print()
        # Print the full patch
        print(entry['patch'])
        break
"
```

For files that were `modified`, the session diff patch shows changes against the pre-Phase-A baseline. To reconstruct the full file, you need to apply the patch to the baseline version. The part table approach works better here:

```bash
python3 -c "
import sqlite3, json
db = sqlite3.connect('$DB')
target = 'src/archive/handler.ts'  # change this
cursor = db.execute('''
    SELECT time_created, data
    FROM part
    WHERE session_id = '$SESSION_ID'
      AND json_extract(data, '\$.tool') = 'apply_patch'
      AND data LIKE '%' || ? || '%'
    ORDER BY time_created
''', (target,))
for row in cursor:
    data = json.loads(row[1])
    patch = data.get('state', {}).get('input', {}).get('patchText', '')
    for line in patch.split('\n'):
        if any(line.startswith(f'*** {op}: ') for op in ['Add File', 'Update File', 'Delete File']):
            print(f'--- {row[0]}: {line} ---')
            break
    print(patch[:3000])
    print()
"
```

### 5. Get all tool calls of a specific type

```bash
# Example: all grep calls
sqlite3 "$DB" "
SELECT time_created,
       json_extract(data, '$.state.input.pattern') as pattern,
       substr(json_extract(data, '$.state.output'), 1, 200) as output_preview
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.tool') = 'grep'
ORDER BY time_created
"

# Example: all todowrite calls (to see what tasks the agent tracked)
sqlite3 "$DB" "
SELECT time_created, json_extract(data, '$.state.input') as todo
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.tool') = 'todowrite'
ORDER BY time_created
"
```

### 6. List every file the session touched (created, modified, or deleted)

```bash
python3 -c "
import sqlite3, json
db = sqlite3.connect('$DB')
cursor = db.execute('''
    SELECT time_created, data
    FROM part
    WHERE session_id = '$SESSION_ID'
      AND json_extract(data, '\$.tool') = 'apply_patch'
    ORDER BY time_created
''')

file_ops = {}
for row in cursor:
    data = json.loads(row[1])
    patch = data.get('state', {}).get('input', {}).get('patchText', '')
    for line in patch.split('\n'):
        for op in ['Add File', 'Update File', 'Delete File']:
            prefix = f'*** {op}: '
            if line.startswith(prefix):
                filepath = line[len(prefix):]
                if filepath.startswith('/home/rektide/src/rekon/'):
                    filepath = filepath[len('/home/rektide/src/rekon/'):]
                file_ops.setdefault(filepath, []).append(op)
                break

for f in sorted(file_ops.keys()):
    ops = ' -> '.join(file_ops[f])
    print(f'{ops:40s}  {f}')
"
```

### 7. Get the conversation between user and agent

```bash
sqlite3 "$DB" "
SELECT time_created,
       CASE
         WHEN json_extract(data, '$.synthetic') = 1 THEN 'system'
         ELSE 'conversation'
       END as kind,
       json_extract(data, '$.text') as text
FROM part
WHERE session_id = '$SESSION_ID'
  AND json_extract(data, '$.type') = 'text'
ORDER BY time_created
"
```

## Re-implementation strategy for a future agent

### The right approach

1. **Read the reasoning first.** Start with the 97 reasoning blocks. They contain the agent's design decisions, vocabulary choices, and architectural rationale. Understanding these is more valuable than any patch.

2. **Read the conversation.** The text parts show what the user directed and what constraints they imposed (drop prefixes, use FCIS, breaking changes OK, keep subsystem separation).

3. **Read the session diff.** The 74-file session diff shows the final state of every change. For `added` files, extract the complete content. For `modified` files, understand what changed and why.

4. **Look at the current codebase.** The current codebase may have drifted from what Phase A expected. Understand what exists now, then adapt Phase A's intent to the current state.

5. **Implement incrementally with verification.** Don't try to apply 74 files at once. Start with:
   - Create `src/planner/types.ts` (the core vocabulary)
   - Create `src/planner/args.ts` (state resolution)
   - Create `src/planner/run-state.ts` (per-repo tracking)
   - Create `src/planner/plugin.ts` (gunshi plugin)
   - Create `src/planner/stages.ts` (stage factory)
   - Update one handler (e.g., archive) as a proof of concept
   - Update `src/plugin/index.ts` to wire the planner
   - Update command files
   - Remove legacy files
   - Run verification after each group

6. **Adapt, don't copy.** The current codebase may have new files, renamed types, or different patterns. The goal is to achieve the architectural intent (planner-driven action stages), not to reproduce the exact code.

### What NOT to do

- Don't mechanically extract diffs and try to apply them. The codebase has changed.
- Don't try to reconstruct `src/repo/provider/` files. Those providers already exist in `src/provider/`.
- Don't expect exact type names to match. The vocabulary may have shifted.
- Don't assume the current test infrastructure is identical.

### Key references in the session

The session produced these documentation files that describe the architecture:

- `doc/phase3-arch.md` — the architecture document (262 lines, status `added` in session diff)
- `doc/phase3-direction.md` — design direction notes (11,333 lines, status `added`)
- `doc/fancy-graph.md` — mermaid diagrams (132 lines, status `added`)

Extract these first from the session diff to understand the intended architecture before looking at code.
