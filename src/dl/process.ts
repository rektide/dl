import { appendFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { syncArchive } from "../archive/sync.ts"
import { syncWiki } from "../wiki/sync.ts"
import {
	linkSpecificProject,
} from "../repo/link.ts"
import { resolveRepository } from "./repository.ts"
import type {
	DestinationRoots,
	ProcessInputOptions,
	ResolvedRepo,
} from "./types.ts"

export async function processResolvedInput(
	resolved: ResolvedRepo,
	roots: DestinationRoots,
	options: ProcessInputOptions,
): Promise<boolean> {
	try {
		if (options.doArchlist) {
			const archlistPath = join(homedir(), "archlist")
			await appendFile(archlistPath, `${resolved.cloneUrl}\n`)
		}

		if (options.doArchive) {
			await syncArchive(resolved, roots)
		}

		if (options.doWiki) {
			await syncWiki(resolved, roots, options)
		}

		if (options.doArchive && options.doWiki) {
			const linkErrors = await linkSpecificProject({
				archiveRoot: roots.archiveRoot,
				wikiRoot: roots.wikiRoot,
				namespacePath: resolved.namespacePath,
				onEvent: (event, useErrorStream = false) => {
					if (!event.status.startsWith("error")) {
						return
					}
					const line = JSON.stringify(event)
					if (useErrorStream) {
						console.error(line)
						return
					}
					console.log(line)
				},
			})
			if (linkErrors) {
				return true
			}
		}

		return false
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(message)
		return true
	}
}

export async function processInput(
	input: string,
	roots: DestinationRoots,
	options: ProcessInputOptions,
): Promise<boolean> {
	try {
		const resolved = await resolveRepository(input)
		return await processResolvedInput(resolved, roots, options)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(message)
		return true
	}
}
