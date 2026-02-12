#!/usr/bin/env node
import { realpath } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { cli, define } from 'gunshi'
import { c12 } from 'gunshi-c12'
import {
  linkDiscoveredProjects,
  parseZones,
  resolveDestinationRoots,
  type LinkContext,
  type LinkEvent
} from '../repo/link.ts'

const COMMAND_NAME = 'project-link'

interface ProjectLinkContext extends LinkContext {
  values?: {
    verbose?: boolean
    zones?: string
  }
}

function outputEvent(event: LinkEvent, useErrorStream: boolean = false): void {
  const line = JSON.stringify(event)
  if (useErrorStream) {
    console.error(line)
    return
  }
  console.log(line)
}


async function run(ctx?: ProjectLinkContext) {
  let hadError = false
  const verbose = Boolean(ctx?.values?.verbose)

  try {
    const zones = parseZones(ctx?.values?.zones)
    const { archiveRoot, wikiRoot } = await resolveDestinationRoots(ctx)
    hadError = await linkDiscoveredProjects({
      archiveRoot,
      wikiRoot,
      zones,
      verbose,
      onEvent: outputEvent
    })
  } catch (error) {
    hadError = true
    const message = error instanceof Error ? error.message : String(error)
    outputEvent({
      status: 'error',
      sourceRoot: 'archive',
      targetRoot: 'wiki',
      org: '',
      project: '',
      namespacePath: '',
      sourcePath: '',
      targetPath: '',
      message
    }, true)
  }

  if (hadError) {
    process.exit(1)
  }
}

export default define({
  name: COMMAND_NAME,
  description: 'Link projects across archive and wiki trees',
  rendering: {
    header: null
  },
  args: {
    zones: {
      type: 'string',
      default: 'archive,wiki',
      description: 'Source zones to process (comma-separated: archive,wiki)'
    },
    verbose: {
      type: 'boolean',
      default: false,
      description: 'Include already-linked and already-directory records'
    }
  },
  run
})

void (async () => {
  const mainPath = await realpath(process.argv[1])
  const mainUrl = pathToFileURL(mainPath).href
  if (import.meta.url === mainUrl) {
    const module = await import('./project-link.ts')
    await cli(process.argv.slice(2), module.default, {
      name: COMMAND_NAME,
      plugins: [c12({ name: 'rekon' })]
    })
  }
})()
