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
