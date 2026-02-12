#!/usr/bin/env node
import { access, readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { define, cli } from 'gunshi'

const COMMAND_NAME = 'project-files'
const DEFAULT_MAX_DEPTH = 2

interface ParsedArgs {
  maxDepth: number
  patterns: string[]
}

function parseArgs(argv: string[]): ParsedArgs {
  const tokens = argv[0] === COMMAND_NAME ? argv.slice(1) : argv
  const patterns: string[] = []
  let maxDepth = DEFAULT_MAX_DEPTH

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === '--max-depth' || token === '-d') {
      const value = tokens[i + 1]
      if (!value) {
        throw new Error('Missing value for --max-depth/-d')
      }
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid max depth: ${value}`)
      }
      maxDepth = parsed
      i += 1
      continue
    }
    if (token.startsWith('-')) {
      continue
    }
    patterns.push(token)
  }

  if (patterns.length === 0) {
    throw new Error('At least one pattern is required')
  }

  return { maxDepth, patterns }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function matchesAnyPattern(filepath: string, patterns: string[]): boolean {
  const normalized = filepath.toLowerCase()
  for (const pattern of patterns) {
    if (normalized.includes(pattern.toLowerCase())) {
      return true
    }
  }
  return false
}

async function collectMatches(patterns: string[], maxDepth: number): Promise<string[]> {
  const roots = [
    join(homedir(), 'archive'),
    join(homedir(), 'wiki')
  ]
  const results = new Set<string>()

  for (const root of roots) {
    if (!await exists(root)) {
      continue
    }

    const entries: string[] = []
    const walk = async (directory: string, depth: number): Promise<void> => {
      if (depth > maxDepth) {
        return
      }

      const dirEntries = await readdir(directory, { withFileTypes: true })
      for (const dirEntry of dirEntries) {
        const fullPath = join(directory, dirEntry.name)
        const entryPath = relative(root, fullPath)
        entries.push(entryPath)

        if (dirEntry.isDirectory()) {
          await walk(fullPath, depth + 1)
        }
      }
    }

    await walk(root, 1)

    for (const entry of entries) {
      if (matchesAnyPattern(entry, patterns)) {
        results.add(join(root, entry))
      }
    }
  }

  return Array.from(results).sort()
}

async function run() {
  const { patterns, maxDepth } = parseArgs(process.argv.slice(2))
  const matches = await collectMatches(patterns, maxDepth)

  for (const match of matches) {
    console.log(match)
  }
}

export default define({
  name: COMMAND_NAME,
  description: 'Find archive/wiki entries that match project patterns',
  args: {
    'max-depth': {
      type: 'number',
      short: 'd',
      default: DEFAULT_MAX_DEPTH,
      description: 'Maximum search depth (default: 2)'
    }
  },
  run
})

void (async () => {
  const mainPath = await realpath(process.argv[1])
  const mainUrl = pathToFileURL(mainPath).href
  if (import.meta.url === mainUrl) {
    const module = await import('./project-files.ts')
    await cli(process.argv.slice(2), module.default, { name: COMMAND_NAME })
  }
})()
