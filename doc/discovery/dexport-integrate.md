# Dexport Integration Plan

Plan for integrating dexport source code into rekon as plugins and a command.

---

# Journal - Dexport Architecture Analysis

## Overview

Dexport is a wiki scraper for deepwiki.com that downloads and mirrors wiki content locally. It's already built with gunshi, making integration straightforward.

**Source location:** `~/src/dexport/src/`

## Files Analyzed

| File | Lines | Purpose |
|------|-------|---------|
| `cli.ts` | 90 | Gunshi CLI entry point |
| `types.ts` | 13 | Core types (OverwriteMode, LinkPredicate, PageStats) |
| `scraper/scraper.ts` | 109 | Main scraping loop with fetch/queue |
| `scraper/seen.ts` | 2 | Global seen assets set (module-level state) |
| `scraper/downloader.ts` | 70 | Asset downloading logic |
| `scraper/html.ts` | 84 | HTML resource extraction using HTMLRewriter |
| `url/paths.ts` | 26 | Output path generation |
| `url/predicates.ts` | 12 | Link predicates (origin, subtree) |
| `url/util.ts` | 22 | URL utilities (ensureUrl, applyReplaceHost) |
| `stats.ts` | 8 | Stats logging as JSON |
| `decorator/last-indexed.ts` | 33 | Extracts last-indexed from JSON-LD |
| `decorate/registry.ts` | 23 | Decorator registry |
| `decorate/types.ts` | 11 | Decorator types |

**Total:** ~500 lines of source code

## Dependencies (from imports)

- `gunshi` - CLI framework (already in rekon)
- `html-rewriter-wasm` - HTML parsing via WebAssembly (NEW)
- `node:fs/promises` - File system
- `node:path` - Path utilities

## Core Concepts

### Scraping Flow

1. **URL Queue Processing** - BFS traversal of pages
2. **Link Predicate** - Filter which links to follow (`origin` vs `subtree`)
3. **HTML Extraction** - Use HTMLRewriter to extract links and assets
4. **Asset Deduplication** - Global `seenAssets` set
5. **Output Path Mapping** - Convert URLs to file paths with optional host stripping
6. **Overwrite Modes** - `ignore` (skip), `cache` (keep existing), `update` (redownload)

### Host Replacement

Key feature: `--replace-host` allows transforming URLs from one host to another:
```
deepwiki.com → github.com (for URL display)
github.com → deepwiki.com (for scraping)
```

This is exactly what `dl.ts` needs for deepwiki integration!

### Decorator System

WIP system for extracting metadata from HTML during scraping. Currently has `last-indexed` decorator for JSON-LD date extraction.

---

# Current DL Integration (subprocess)

From [`dl.ts`](/home/rektide/src/rekon/src/command/dl.ts):

```typescript
// Lines 391-428: Current dexport integration
if (resolved.host === "github.com") {
  const dexportPath = join(homedir(), "src", "dexport", "src", "cli.ts")
  if (await exists(dexportPath)) {
    const deepwikiUrl = `https://deepwiki.com/${resolved.org}/${resolved.repo}`
    // ... runs dexport as subprocess
  }
}
```

**Problems with subprocess approach:**
1. Requires dexport to be at hardcoded path
2. No shared types or extensions
3. Can't share repo plugin for URL transformation
4. Duplicate dependency management

---

# Proposed Integration

## 1. Domain Module: `src/scraper/`

Move dexport's scraper logic to rekon domain modules:

```
src/scraper/
├── mod.ts              # Public exports
├── scrape.ts           # Core scraping logic
├── download.ts         # Asset downloading
├── html.ts             # HTML resource extraction
├── seen.ts             # Asset deduplication
├── url/
│   ├── paths.ts        # Output path mapping
│   ├── predicates.ts   # Link predicates
│   └── util.ts         # URL utilities
├── decorate/
│   ├── registry.ts     # Decorator registry
│   ├── types.ts        # Decorator types
│   └── last-indexed.ts # Last indexed decorator
└── types.ts            # Core scraper types
```

## 2. Plugin: `scraper`

**Location:** `src/plugin/scraper.ts`

Create a scraper plugin using the factory pattern:

```typescript
// src/plugin/scraper.ts
import { plugin } from 'gunshi/plugin'
import type { ScraperExtension, ScraperPluginOptions } from '../scraper/types.ts'

export function createScraperPlugin(options: ScraperPluginOptions = {}): PluginWithExtension<ScraperExtension> {
  return plugin({
    id: 'scraper',
    name: 'Scraper Plugin',
    extension: (ctx, cmd) => {
      return {
        scrape,
        downloadAsset,
        createLinkPredicate,
        extractResources,
        getOutputPath,
      }
    }
  })
}

export type { ScraperExtension, ScraperPluginOptions }
```

### ScraperExtension Interface

```typescript
// src/scraper/types.ts
import type { LinkPredicate, OverwriteMode, PageStats } from './types.ts'

export interface ScraperOptions {
  /** Starting URL(s) to scrape */
  urls: URL[]
  /** Output directory */
  outputDir: string
  /** Link predicate type */
  predicate: 'origin' | 'subtree'
  /** Overwrite mode */
  overwrite: OverwriteMode
  /** Strip hostname from output paths */
  stripHost: boolean
  /** Replace host in URLs (for scraping vs display) */
  replacementHost?: string
  /** Optional event handler for stats */
  onStats?: (stats: PageStats) => void
}

export interface ScraperExtension {
  /** Scrape pages starting from given URLs */
  scrape(options: ScraperOptions): Promise<ScrapeResult>
  
  /** Download a single asset */
  downloadAsset(
    url: URL, 
    outputDir: string, 
    overwrite: OverwriteMode,
    stripHost: boolean,
    replacementHost?: string
  ): Promise<boolean>
  
  /** Create a link predicate function */
  createLinkPredicate(type: 'origin' | 'subtree', baseUrl: URL): LinkPredicate
  
  /** Extract links and assets from HTML */
  extractResources(html: string, baseUrl: URL, replacementHost?: string): ExtractedResources
  
  /** Get output path for a page URL */
  getPageOutputPath(url: URL, outputDir: string, stripHost: boolean, hasChildResources: boolean): string
  
  /** Get output path for an asset URL */
  getAssetOutputPath(url: URL, outputDir: string, stripHost: boolean): string
  
  /** Register a decorator */
  registerDecorator(decorator: Decorator): void
  
  /** Decorate HTML with registered decorators */
  decorateHtml(html: string): Promise<DecoratorResult>
}

export interface ScrapeResult {
  pagesProcessed: number
  assetsDownloaded: number
  errors: Array<{ url: string; error: Error }>
}
```

### ScraperPluginOptions

```typescript
export interface ScraperPluginOptions {
  /** Custom fetch function for testing */
  fetch?: typeof globalThis.fetch
  /** Custom logger */
  logger?: (message: string) => void
  /** Enable decorator system */
  enableDecorators?: boolean
}
```

## 3. Command: `rekon dexport`

**Location:** `src/command/dexport.ts`

Create a thin command that uses the scraper plugin:

```typescript
// src/command/dexport.ts
import { define, lazy } from 'gunshi'
import type { ScraperExtension } from '../scraper/types.ts'

export default define({
  name: 'dexport',
  description: 'Scrape wiki content from deepwiki.com or other sources',
  args: {
    urls: { 
      type: 'positional', 
      description: 'URLs to scrape', 
      multiple: true 
    },
    url: { 
      type: 'string', 
      description: 'URL to start scraping' 
    },
    output: { 
      type: 'string', 
      description: 'Output directory',
      short: 'o'
    },
    predicate: {
      type: 'string',
      description: 'Link predicate: origin or subtree',
      default: 'subtree',
    },
    overwrite: {
      type: 'string',
      description: 'Overwrite mode: ignore, cache, or update',
      default: 'cache',
    },
    'strip-host': { 
      type: 'boolean', 
      description: 'Remove hostname from output paths' 
    },
    'replace-host': {
      type: 'string',
      description: 'Replace hostname in URLs with specified hostname',
    },
  },
  async run(ctx) {
    const scraper = ctx.extensions.scraper as ScraperExtension
    const repo = ctx.extensions.repo as RepoExtension
    
    const {
      url,
      urls,
      output,
      predicate,
      overwrite,
      'strip-host': stripHost,
      'replace-host': replacementHost,
    } = ctx.values
    
    const urlList = url ? [url] : (urls ?? [])
    if (urlList.length === 0) {
      console.error('No URLs provided. Use positional arguments or --url.')
      return
    }
    
    const parsedUrls = urlList.map(u => repo.parseUrl(u))
    const outputDir = output ?? '.'
    
    const result = await scraper.scrape({
      urls: parsedUrls,
      outputDir,
      predicate: predicate as 'origin' | 'subtree',
      overwrite: overwrite as OverwriteMode,
      stripHost,
      replacementHost,
      onStats: (stats) => console.log(JSON.stringify(stats)),
    })
    
    console.error(`Scraping complete. ${result.pagesProcessed} pages processed.`)
  },
})
```

## 4. Plugin: `repo` Enhancement

The `repo` plugin should support deepwiki URL transformation:

```typescript
// Enhanced RepoExtension
export interface RepoExtension {
  // ... existing methods ...
  
  /** Transform a GitHub URL to deepwiki.com */
  toDeepwikiUrl(org: string, repo: string): URL
  
  /** Transform a deepwiki URL to GitHub */
  fromDeepwikiUrl(url: URL): { org: string; repo: string }
  
  /** Parse any URL, handling special cases */
  parseUrl(input: string): URL
}
```

## 5. Updated DL Integration

The `dl` command can now use the scraper plugin directly:

```typescript
// src/command/dl.ts (updated)
async function run(ctx: DlCommandContext) {
  const scraper = ctx.extensions.scraper as ScraperExtension
  const repo = ctx.extensions.repo as RepoExtension
  
  // ... resolve repository ...
  
  if (resolved.host === 'github.com') {
    const deepwikiUrl = repo.toDeepwikiUrl(resolved.org, resolved.repo)
    
    await scraper.scrape({
      urls: [deepwikiUrl],
      outputDir: wikiDestination,
      predicate: 'subtree',
      overwrite: consumeDexportOutput ? 'ignore' : 'cache',
      stripHost: false,
      replacementHost: 'deepwiki.com', // URLs use github.com, but fetch from deepwiki
    })
  }
}
```

---

# Proposed File Structure

After integration, rekon structure becomes:

```
src/
├── command/
│   ├── combine.ts
│   ├── dl.ts              # Uses repo, archive, wiki, scraper plugins
│   ├── dexport.ts         # NEW: Uses scraper plugin directly
│   ├── install-commands.ts
│   ├── interpolate.ts
│   ├── project-files.ts
│   └── project-link.ts
├── plugin/
│   ├── archive.ts         # Archive plugin + extension
│   ├── scraper.ts         # NEW: Scraper plugin + extension
│   ├── wiki.ts            # Wiki plugin + extension
│   ├── repo.ts            # Repository parsing + deepwiki transform
│   └── link.ts            # Symlink plugin
├── scraper/               # NEW: Domain modules from dexport
│   ├── mod.ts             # Public exports
│   ├── scrape.ts          # Core scraping logic
│   ├── download.ts        # Asset downloading
│   ├── html.ts            # HTML resource extraction
│   ├── seen.ts            # Asset deduplication
│   ├── types.ts           # Core types
│   ├── url/
│   │   ├── paths.ts       # Output path mapping
│   │   ├── predicates.ts  # Link predicates
│   │   └── util.ts        # URL utilities
│   └── decorate/
│       ├── registry.ts    # Decorator registry
│       ├── types.ts       # Decorator types
│       └── last-indexed.ts
├── archive/
│   ├── clone.ts           # Git clone/update logic
│   └── jujutsu.ts         # JJ initialization
├── wiki/
│   └── git-wiki.ts        # Git wiki clone
├── repository/
│   ├── parse.ts           # URL parsing
│   ├── resolve.ts         # Host resolution
│   └── validate.ts        # API validation
└── repo/
    └── link.ts            # Existing symlink logic
```

---

# Dependencies to Add

From dexport, rekon will need:

```json
{
  "dependencies": {
    "html-rewriter-wasm": "^0.4.1"
  }
}
```

Note: `gunshi` is already a dependency.

---

# Implementation Order

1. **Create `src/scraper/` domain modules**
   - Copy dexport source files
   - Rename/refactor for rekon conventions
   - Make `seen.ts` stateless (pass Set as parameter)

2. **Create `src/plugin/scraper.ts`**
   - Factory function with options
   - Extension interface implementation
   - Register with global plugins in `rekon.ts`

3. **Create `src/command/dexport.ts`**
   - Thin command using scraper plugin
   - Register as lazy subcommand

4. **Enhance `src/plugin/repo.ts`**
   - Add `toDeepwikiUrl()` and `fromDeepwikiUrl()`

5. **Update `src/command/dl.ts`**
   - Use scraper plugin instead of subprocess
   - Remove dexport path detection

6. **Add `html-rewriter-wasm` dependency**

7. **Remove subprocess integration**
   - Delete dexport path checking code
   - Remove `runDetached()` for dexport

---

# Design Decisions

## 1. Stateless Scraping ✓

Current dexport uses module-level `seenAssets` set. This should be:

```typescript
// Before (dexport)
export const seenAssets = new Set<string>()

// After (rekon)
export interface ScrapeContext {
  seenAssets: Set<string>
  processed: Set<string>
  queue: Set<string>
}

export function createScrapeContext(): ScrapeContext {
  return {
    seenAssets: new Set(),
    processed: new Set(),
    queue: new Set(),
  }
}
```

This allows multiple concurrent scrapes without state collision.

## 2. Decorator System ✓

Keep the decorator system as-is. It's extensible and useful for metadata extraction:

```typescript
// Register custom decorators
scraper.registerDecorator(myCustomDecorator)

// Decorators run during scrape
const result = await scraper.scrape({ ... })
// result.decorations contains decorator outputs
```

## 3. Event-Based Stats ✓

Replace direct `console.log` with callback:

```typescript
await scraper.scrape({
  ...,
  onStats: (stats) => {
    // Command decides how to output
    console.log(JSON.stringify(stats))
  }
})
```

## 4. Integration with Repo Plugin ✓

The repo plugin handles URL transformation between hosts:

```typescript
// In dl.ts
const deepwikiUrl = repo.transformHost(githubUrl, 'deepwiki.com')

// Or specific method
const deepwikiUrl = repo.toDeepwikiUrl(org, repo)
```

---

# Open Questions

1. **Asset download parallelism** - Should we download assets in parallel? Currently sequential.

2. **Rate limiting** - Should scraper plugin support rate limiting options?

3. **Retry logic** - Current dexport has no retry. Add to plugin options?

4. **Progress reporting** - Add progress callback for long scrapes?

---

# Next Steps

1. Create `src/scraper/` directory and copy domain modules
2. Implement `createScraperPlugin()` factory
3. Create `rekon dexport` command
4. Add `html-rewriter-wasm` to dependencies
5. Update `dl.ts` to use scraper plugin
6. Test with existing deepwiki.com URLs
