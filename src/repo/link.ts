import { lstat, mkdir, readdir, readlink, symlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export type RootName = 'archive' | 'wiki'

interface DlDirectoryConfig {
  ARCHIVE_DIR?: unknown
  WIKI_DIR?: unknown
}

interface C12ConfigLoader {
  loadConfig: () => Promise<{ config?: DlDirectoryConfig }>
}

export interface LinkContext {
  extensions?: {
    c12?: C12ConfigLoader
  }
}

export interface ProjectEntry {
  namespacePath: string
  org: string
  project: string
  sourcePath: string
}

export interface LinkEvent {
  status: string
  sourceRoot: RootName
  targetRoot: RootName
  org: string
  project: string
  namespacePath: string
  sourcePath: string
  targetPath: string
  message?: string
}

export type LinkEventHandler = (event: LinkEvent, useErrorStream?: boolean) => void

export const DEFAULT_ZONES: RootName[] = ['archive', 'wiki']

function configuredDirectory(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseNamespace(namespacePath: string): { org: string, project: string } {
  const parts = namespacePath.split('/').filter(Boolean)
  return {
    org: parts[0] ?? '',
    project: parts[parts.length - 1] ?? ''
  }
}

function createProjectEntry(namespacePath: string, sourcePath: string): ProjectEntry {
  const { org, project } = parseNamespace(namespacePath)
  return {
    namespacePath,
    org,
    project,
    sourcePath
  }
}

export async function resolveDestinationRoots(ctx?: LinkContext): Promise<{ archiveRoot: string, wikiRoot: string }> {
  const defaultArchiveRoot = join(homedir(), 'archive')
  const defaultWikiRoot = join(homedir(), 'wiki')

  const envArchiveRoot = configuredDirectory(process.env.ARCHIVE_DIR)
  const envWikiRoot = configuredDirectory(process.env.WIKI_DIR)
  const defaults = {
    archiveRoot: envArchiveRoot ?? defaultArchiveRoot,
    wikiRoot: envWikiRoot ?? defaultWikiRoot
  }

  const configLoader = ctx?.extensions?.c12
  if (!configLoader) {
    return defaults
  }

  const loaded = await configLoader.loadConfig()
  const configArchiveRoot = configuredDirectory(loaded.config?.ARCHIVE_DIR)
  const configWikiRoot = configuredDirectory(loaded.config?.WIKI_DIR)

  return {
    archiveRoot: configArchiveRoot ?? defaults.archiveRoot,
    wikiRoot: configWikiRoot ?? defaults.wikiRoot
  }
}

export function parseZones(value: string | undefined): RootName[] {
  if (!value || !value.trim()) {
    return DEFAULT_ZONES
  }

  const zones = new Set<RootName>()
  for (const rawToken of value.split(',')) {
    const token = rawToken.trim().toLowerCase()
    if (!token) {
      continue
    }
    if (token !== 'archive' && token !== 'wiki') {
      throw new Error(`Invalid zone "${token}". Allowed zones: archive,wiki`)
    }
    zones.add(token)
  }

  if (zones.size === 0) {
    return DEFAULT_ZONES
  }

  return Array.from(zones)
}

export async function discoverProjects(rootPath: string): Promise<ProjectEntry[]> {
  const projects: ProjectEntry[] = []
  let orgEntries: Array<{ name: string, isDirectory: () => boolean }>

  try {
    orgEntries = await readdir(rootPath, { encoding: 'utf8', withFileTypes: true })
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err?.code === 'ENOENT') {
      return projects
    }
    throw error
  }

  for (const orgEntry of orgEntries) {
    if (!orgEntry.isDirectory()) {
      continue
    }

    const orgPath = join(rootPath, orgEntry.name)
    const projectEntries = await readdir(orgPath, { encoding: 'utf8', withFileTypes: true })
    for (const projectEntry of projectEntries) {
      if (!projectEntry.isDirectory()) {
        continue
      }

      const namespacePath = `${orgEntry.name}/${projectEntry.name}`
      const projectPath = join(rootPath, namespacePath)
      let hasGitMarker = false
      try {
        await lstat(join(projectPath, '.git'))
        hasGitMarker = true
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        if (err?.code !== 'ENOENT') {
          throw error
        }
      }

      if (!hasGitMarker) {
        continue
      }

      projects.push(createProjectEntry(namespacePath, projectPath))
    }
  }

  return projects
}

export async function ensureLinkedProject(
  entry: ProjectEntry,
  sourceRoot: RootName,
  targetRoot: RootName,
  targetBase: string,
  verbose: boolean,
  onEvent?: LinkEventHandler
): Promise<boolean> {
  const targetPath = join(targetBase, entry.namespacePath)

  try {
    await mkdir(dirname(targetPath), { recursive: true })

    let destinationStats: Awaited<ReturnType<typeof lstat>> | undefined
    try {
      destinationStats = await lstat(targetPath)
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err?.code !== 'ENOENT') {
        throw error
      }
    }

    if (!destinationStats) {
      await symlink(entry.sourcePath, targetPath, 'dir')
      onEvent?.({
        status: 'linked',
        sourceRoot,
        targetRoot,
        org: entry.org,
        project: entry.project,
        namespacePath: entry.namespacePath,
        sourcePath: entry.sourcePath,
        targetPath
      })
      return false
    }

    if (destinationStats.isDirectory()) {
      if (verbose) {
        onEvent?.({
          status: 'already-directory',
          sourceRoot,
          targetRoot,
          org: entry.org,
          project: entry.project,
          namespacePath: entry.namespacePath,
          sourcePath: entry.sourcePath,
          targetPath
        })
      }
      return false
    }

    if (destinationStats.isSymbolicLink()) {
      const existingLinkTarget = await readlink(targetPath)
      const resolvedExistingTarget = resolve(dirname(targetPath), existingLinkTarget)
      if (resolvedExistingTarget === entry.sourcePath) {
        if (verbose) {
          onEvent?.({
            status: 'already-linked',
            sourceRoot,
            targetRoot,
            org: entry.org,
            project: entry.project,
            namespacePath: entry.namespacePath,
            sourcePath: entry.sourcePath,
            targetPath
          })
        }
        return false
      }

      onEvent?.({
        status: 'error-mismatched-link',
        sourceRoot,
        targetRoot,
        org: entry.org,
        project: entry.project,
        namespacePath: entry.namespacePath,
        sourcePath: entry.sourcePath,
        targetPath,
        message: `Existing symlink points to ${existingLinkTarget}`
      }, true)
      return true
    }

    onEvent?.({
      status: 'error-existing-non-directory',
      sourceRoot,
      targetRoot,
      org: entry.org,
      project: entry.project,
      namespacePath: entry.namespacePath,
      sourcePath: entry.sourcePath,
      targetPath,
      message: 'Target exists and is not a directory or symlink'
    }, true)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    onEvent?.({
      status: 'error-link-failed',
      sourceRoot,
      targetRoot,
      org: entry.org,
      project: entry.project,
      namespacePath: entry.namespacePath,
      sourcePath: entry.sourcePath,
      targetPath,
      message
    }, true)
    return true
  }
}

export async function linkDiscoveredProjects(options: {
  archiveRoot: string
  wikiRoot: string
  zones: RootName[]
  verbose: boolean
  onEvent?: LinkEventHandler
}): Promise<boolean> {
  const resolvedArchiveRoot = resolve(options.archiveRoot)
  const resolvedWikiRoot = resolve(options.wikiRoot)
  await mkdir(resolvedArchiveRoot, { recursive: true })
  await mkdir(resolvedWikiRoot, { recursive: true })

  const [archiveProjects, wikiProjects] = await Promise.all([
    discoverProjects(resolvedArchiveRoot),
    discoverProjects(resolvedWikiRoot)
  ])

  let hadError = false

  if (options.zones.includes('archive')) {
    for (const entry of archiveProjects) {
      const failed = await ensureLinkedProject(entry, 'archive', 'wiki', resolvedWikiRoot, options.verbose, options.onEvent)
      if (failed) {
        hadError = true
      }
    }
  }

  if (options.zones.includes('wiki')) {
    for (const entry of wikiProjects) {
      const failed = await ensureLinkedProject(entry, 'wiki', 'archive', resolvedArchiveRoot, options.verbose, options.onEvent)
      if (failed) {
        hadError = true
      }
    }
  }

  return hadError
}

export async function linkSpecificProject(options: {
  archiveRoot: string
  wikiRoot: string
  namespacePath: string
  verbose?: boolean
  onEvent?: LinkEventHandler
}): Promise<boolean> {
  const resolvedArchiveRoot = resolve(options.archiveRoot)
  const resolvedWikiRoot = resolve(options.wikiRoot)
  const namespacePath = options.namespacePath.replace(/^\/+/, '').replace(/\.git$/, '')
  const archiveEntry = createProjectEntry(namespacePath, join(resolvedArchiveRoot, namespacePath))
  const wikiEntry = createProjectEntry(namespacePath, join(resolvedWikiRoot, namespacePath))

  let hadError = false
  const verbose = Boolean(options.verbose)

  const archiveLinkFailed = await ensureLinkedProject(
    archiveEntry,
    'archive',
    'wiki',
    resolvedWikiRoot,
    verbose,
    options.onEvent
  )
  if (archiveLinkFailed) {
    hadError = true
  }

  const wikiLinkFailed = await ensureLinkedProject(
    wikiEntry,
    'wiki',
    'archive',
    resolvedArchiveRoot,
    verbose,
    options.onEvent
  )
  if (wikiLinkFailed) {
    hadError = true
  }

  return hadError
}
