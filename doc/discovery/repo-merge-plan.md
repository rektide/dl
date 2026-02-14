# Repository Merge Plan: dexport into rekon

## Overview

### What We're Merging

- **Source**: `~/src/dexport` (22 commits) - Web scraping and downloading tool
- **Target**: `~/src/rekon` (92 commits) - Project management and command orchestration

Both repositories:
- Use jujutsu (jj) on top of git
- Share the same remote structure (origin, tngl, voodoo)
- Are TypeScript projects with similar tooling (gunshi, oxlint, oxfmt)

### Why Merge

The dexport functionality (web scraping/downloading) is complementary to rekon's existing `dl` command which already downloads git repositories and wikis. Consolidating these tools will:

1. Unify related functionality under one project
2. Share common infrastructure (CLI framework, utilities)
3. Reduce maintenance burden across two repositories
4. Enable better integration between downloading capabilities

---

## Git-based Options

### Option 1: `git subtree add`

The subtree approach preserves full history while placing dexport content in a subdirectory.

```bash
# In rekon repository
git subtree add --prefix=dexport ~/src/dexport main
```

**Pros:**
- Preserves complete history from dexport
- Creates a single cohesive repository
- History is queryable with standard git commands
- Can later update from dexport if needed with `git subtree pull`
- Files are immediately placed in target subdirectory

**Cons:**
- History is interleaved at merge point (not truly separate)
- More complex history graph
- Harder to later extract if needed
- `git subtree` commands are slower for large repos
- Commit hashes change (new commits are created)

### Option 2: `git merge --allow-unrelated-histories`

This merges two repositories that don't share a common ancestor.

```bash
# In rekon repository
git remote add dexport ~/src/dexport
git fetch dexport
git merge --allow-unrelated-histories dexport/main -m "Merge dexport repository"
git remote remove dexport
```

**Pros:**
- Simple and standard git operation
- Preserves original commit hashes (except merge commit)
- Clear merge point in history
- Full history preserved
- Easy to understand the merge structure

**Cons:**
- Files land at repository root, need manual reorganization
- Potential file conflicts if same-named files exist
- No built-in mechanism for future updates from source repo
- Directory structure needs post-merge work

---

## JJ-based Options

JJ doesn't have a native "merge unrelated histories" command. We must use git underneath, but can work within jj's workflow.

### Option A: Git Subtree via JJ

```bash
# JJ wraps git commands - use git directly for the subtree operation
cd ~/src/rekon
git subtree add --prefix=vendor/dexport ~/src/dexport main

# JJ will see the new commits - sync its view
jj debug reindex  # May be needed to refresh jj's view
```

### Option B: Git Merge via JJ Working Copy

```bash
# Add the remote and fetch
cd ~/src/rekon
git remote add dexport ~/src/dexport
git fetch dexport

# Create a merge using jj
jj new main dexport/main

# This creates a merge commit with both histories
# Then commit the result
jj commit -m "Merge dexport repository"
```

**JJ-specific Considerations:**

1. **Conflict Resolution**: JJ handles conflicts differently - it stores conflicts in the working copy and expects you to resolve them before committing

2. **Bookmark Handling**: After merge, bookmarks from dexport won't automatically be tracked. If you want to preserve them:
   ```bash
   jj bookmark track dexport/main@origin
   ```

3. **Operation Log**: JJ keeps an operation log that records the merge. This can be undone with `jj op undo` if something goes wrong.

4. **Immutable Commits**: Once commits are in the jj repo, they're part of the history. The merge operation is reversible via `jj op undo`.

5. **Working Copy**: JJ's working copy is a special commit. After git operations, you may need `jj workspace update-stale` if jj gets confused.

---

## Post-Merge Cleanup

### Moving Files into Target Structure

After the merge, dexport files will either be:
- In a subdirectory (subtree approach) - `dexport/`
- At root level (merge approach) - need to move

**For merge approach, relocate files:**

```bash
# Create target directory structure
mkdir -p src/dexport

# Move files using git mv to preserve history attribution
git mv src/cli.ts src/dexport/
git mv src/decorate src/dexport/
git mv src/decorator src/dexport/
git mv src/types.ts src/dexport/
git mv src/stats.ts src/dexport/
git mv src/url src/dexport/
git mv src/scraper src/dexport/

# Commit the reorganization
jj commit -m "Reorganize: move dexport code to src/dexport/"
```

**Alternative using git-filter-repo for cleaner history:**

If you want to rewrite history so dexport commits appear as if they were always in `src/dexport/`:

```bash
# Before merging, in dexport repo
cd ~/src/dexport
git filter-repo --to-subdirectory-filter src/dexport --force

# Then merge with rewritten history
cd ~/src/rekon
git remote add dexport ~/src/dexport
git fetch dexport
git merge --allow-unrelated-histories dexport/main
```

### Preserving History Attribution

All approaches preserve commit authorship and timestamps. To verify:

```bash
# View commits from original dexport authors
git log --author="rektide" --oneline

# See full commit details including original author
git log --format=fuller

# Trace file history across the merge
git log --follow -- src/dexport/src/cli.ts
```

---

## Recommended Approach

### For This Merge: `git merge --allow-unrelated-histories`

**Rationale:**

1. **Simpler Operation**: One straightforward command vs subtree complexity
2. **Preserves Hashes**: Original commit hashes remain intact (easier for reference)
3. **Clear History**: The merge point is explicit and easy to understand
4. **JJ Compatible**: Works well with jj's model - we can use `jj new` to create the merge
5. **No Future Sync Needed**: dexport will be deprecated after merge, no need for subtree's pull capability

**Trade-off Accepted**: Files land at root and need manual reorganization, but this is a one-time cost and gives us control over final structure.

### Alternative Recommendation

If you prefer files to land directly in a subdirectory without post-merge moves, use **git subtree**. This is slightly more complex but saves the reorganization step.

---

## Step-by-Step Commands

### Pre-Merge Preparation

```bash
# 1. Ensure both repos are clean and up to date
cd ~/src/dexport
jj status  # Should show no pending changes
jj log -r '@'  # Check current state

cd ~/src/rekon
jj status  # Should show no pending changes
jj log -r '@'  # Check current state

# 2. Create backup branches (safety net)
cd ~/src/dexport
jj bookmark create backup-pre-merge
cd ~/src/rekon
jj bookmark create backup-pre-merge

# 3. Push backups if desired
jj git push --bookmark backup-pre-merge
```

### Execute Merge (Recommended Approach)

```bash
# Navigate to rekon
cd ~/src/rekon

# Add dexport as a git remote
git remote add dexport ~/src/dexport

# Fetch dexport's history
git fetch dexport

# Create merge commit using jj
# This merges dexport/main into current working copy
jj new main dexport/main

# If there are conflicts, resolve them
jj status  # Will show any conflicts
# Edit conflicting files, then:
jj resolve --list  # See what needs resolution

# Commit the merge
jj commit -m "Merge dexport repository into rekon

Integrates web scraping and downloading functionality from
dexport project. Files will be reorganized in follow-up commit."

# Remove the temporary remote
git remote remove dexport
```

### Post-Merge Reorganization

```bash
# Create target directory structure
mkdir -p src/dexport

# Move dexport files (preserving history)
# Using git mv for history tracking
git mv README.md src/dexport/README-dexport.md  # Rename to avoid conflict
git mv package.json src/dexport/package-dexport.json
git mv pnpm-lock.yaml src/dexport/pnpm-lock-dexport.yaml
git mv src src-dexport  # Temporarily rename to avoid conflict
mv src-dexport/* src/dexport/  # Move contents
rmdir src-dexport

# Alternatively, be more selective about what to keep:
# - Keep dexport's src/ contents
# - Discard or merge package.json dependencies manually
# - Keep dexport's README as reference

# Commit the reorganization
jj commit -m "Reorganize: move dexport code to src/dexport/

Relocate merged dexport files to dedicated subdirectory.
Package dependencies will be merged in follow-up commit."

# Verify history is preserved
git log --follow -- src/dexport/src/cli.ts
```

### Package.json Merge

```bash
# Manually merge dependencies from src/dexport/package-dexport.json
# into the root package.json, then:
rm src/dexport/package-dexport.json src/dexport/pnpm-lock-dexport.yaml

# Install merged dependencies
pnpm install

# Commit
jj commit -m "Merge dexport dependencies into package.json"
```

### Verification

```bash
# Verify all dexport commits are present
git log --oneline --all | grep -i "dexport\|scrape\|download" | head -20

# Verify history follows files
git log --follow --oneline -- src/dexport/src/cli.ts

# Check that rekon's original history is intact
git log --oneline main~30..main~20  # Should show pre-merge rekon commits

# Run tests to ensure nothing broke
pnpm test

# Type check
pnpm typecheck
```

### Cleanup

```bash
# Remove backup bookmarks after confirming success
jj bookmark delete backup-pre-merge

# If you want to update remotes about the merge
jj git push
```

---

## Troubleshooting

### "fatal: refusing to merge unrelated histories"

This is expected! Use `--allow-unrelated-histories` flag with git, or use jj's `jj new` which handles this automatically.

### JJ shows conflicts after merge

```bash
# List conflicts
jj resolve --list

# Resolve each conflict
jj resolve src/conflicting-file.ts

# Or accept one side
jj resolve --from main src/conflicting-file.ts  # Keep rekon version
```

### Git subtree gives "prefix already exists"

The target directory already exists. Choose a different prefix or move existing files first.

### Lost commits after merge

```bash
# Use jj's operation log to undo and retry
jj op log
jj op undo <operation-id>
```

### Large repository size after merge

If dexport had large binary files or extensive history that bloats the repo:

```bash
# Before merging, clean dexport's history
cd ~/src/dexport
git filter-repo --strip-blobs-bigger-than 1M
```

---

## Summary

| Aspect | git subtree | git merge --allow-unrelated | JJ new merge |
|--------|-------------|----------------------------|--------------|
| History preservation | Full | Full | Full |
| Commit hashes | New | Preserved | Preserved |
| File placement | Subdirectory | Root | Root |
| Complexity | Medium | Low | Low |
| Future syncs | Easy | Manual | Manual |
| JJ compatible | Yes | Yes | Native |

**Recommended**: Use `jj new main dexport/main` for the cleanest jj-native workflow, then reorganize files in a follow-up commit.
