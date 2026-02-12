#!/usr/bin/env node
import { access, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { define } from 'gunshi'
import { x } from 'tinyexec'

const COMMAND_NAME = 'dl'

interface ParsedArgs {
  inputs: string[]
}

interface ResolvedRepo {
  host: string
  org: string
  repo: string
  cloneUrl: string
}

export interface ParsedRepositoryInput {
  host?: string
  org: string
  repo: string
  hasExplicitCloneUrl: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const tokens = argv[0] === COMMAND_NAME ? argv.slice(1) : argv
  const inputs = tokens.filter(token => !token.startsWith('-'))
  return { inputs }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await x(command, args, {
    throwOnError: true,
    nodeOptions: {
      stdio: 'inherit'
    }
  })
}

function runDetached(command: string, args: string[], cwd: string): void {
  const proc = x(command, args, {
    persist: true,
    nodeOptions: {
      cwd,
      stdio: 'ignore',
      detached: true
    }
  })
  proc.process?.unref()
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000)
    })
    return response.status >= 200 && response.status < 400
  } catch {
    return false
  }
}

export function parseRepositoryInput(input: string): ParsedRepositoryInput {
  let raw = input
  raw = raw.replace(/^https?:\/\//, '')
  raw = raw.replace(/^ssh:\/\//, '')
  raw = raw.replace(/^git@/, '')
  raw = raw.replace(':', '/')
  raw = raw.replace(/\.git$/, '')
  raw = raw.replace(/^\/+/, '')

  let host = ''
  let path = raw
  const firstSegment = raw.split('/')[0] ?? ''
  if (raw.includes('/') && (firstSegment.includes('.') || firstSegment === 'localhost')) {
    host = firstSegment
    path = raw.slice(firstSegment.length + 1)
  }

  path = path.replace(/^\/+/, '')
  const segments = path.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new Error(`dl: unsupported repository input: ${input}`)
  }

  const org = segments[0]
  const repo = segments[segments.length - 1]
  const hasExplicitCloneUrl = input.startsWith('git@') || input.includes('://')

  return {
    host: host || undefined,
    org,
    repo,
    hasExplicitCloneUrl
  }
}

async function resolveRepository(input: string): Promise<ResolvedRepo> {
  const parsed = parseRepositoryInput(input)
  let host = parsed.host ?? ''
  const { org, repo } = parsed

  if (!host) {
    for (const candidate of ['github.com', 'gitlab.com']) {
      const probeUrl = `https://${candidate}/${org}/${repo}`
      if (await urlExists(probeUrl)) {
        host = candidate
        break
      }
    }
  }

  if (!host) {
    throw new Error(`dl: could not resolve host for ${org}/${repo} (tried github.com and gitlab.com)`)
  }

  const cloneUrl = parsed.hasExplicitCloneUrl
    ? input
    : `https://${host}/${org}/${repo}.git`

  return { host, org, repo, cloneUrl }
}

async function cloneOrUpdate(remoteUrl: string, destination: string): Promise<void> {
  const gitDir = join(destination, '.git')
  if (await exists(gitDir)) {
    await runCommand('git', ['-C', destination, 'pull', '--ff-only'])
    return
  }

  if (await exists(destination)) {
    throw new Error(`Destination exists and is not a git checkout: ${destination}`)
  }

  await mkdir(dirname(destination), { recursive: true })
  await runCommand('git', ['clone', remoteUrl, destination])
}

async function run() {
  try {
    const { inputs } = parseArgs(process.argv.slice(2))
    if (inputs.length === 0) {
      console.error('usage: rekon dl <repo-url|org/repo> [repo-url|org/repo ...]')
      process.exit(1)
    }

    let hadError = false
    for (const input of inputs) {
      try {
        const resolved = await resolveRepository(input)
        const archiveDestination = join(homedir(), 'archive', resolved.org, resolved.repo)
        const wikiDestination = join(homedir(), 'wiki', resolved.org, resolved.repo)

        console.log(`archive: ${archiveDestination}`)
        await cloneOrUpdate(resolved.cloneUrl, archiveDestination)

        const wikiRemoteUrl = `https://${resolved.host}/${resolved.org}/${resolved.repo}.wiki.git`
        console.log(`wiki: ${wikiDestination}`)
        try {
          await cloneOrUpdate(wikiRemoteUrl, wikiDestination)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.warn(`wiki fetch skipped: ${message}`)
        }

        if (resolved.host === 'github.com') {
          const dexportPath = join(homedir(), 'src', 'dexport', 'src', 'cli.ts')
          if (await exists(dexportPath)) {
            const deepwikiUrl = `https://deepwiki.com/${resolved.org}/${resolved.repo}`
            runDetached(dexportPath, [deepwikiUrl], homedir())
            console.log(`dexport: queued ${deepwikiUrl}`)
          } else {
            console.warn(`dexport skipped: not found at ${dexportPath}`)
          }
        }
      } catch (error) {
        hadError = true
        const message = error instanceof Error ? error.message : String(error)
        console.error(message)
      }
    }

    if (hadError) {
      process.exit(1)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  }
}

export default define({
  name: COMMAND_NAME,
  description: 'Fetch repository checkout and wiki checkout',
  run
})
