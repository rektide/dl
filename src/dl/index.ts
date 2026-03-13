import { appendFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { syncArchive } from "../archive/sync.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"
import {
	linkSpecificProject,
} from "../repo/link.ts"
import type { RepoExtension } from "../plugin/repo.ts"
import { syncWiki } from "../wiki/sync.ts"
import type {
	DestinationRoots,
	ProcessInputOptions,
	RepoContext,
} from "./types.ts"

export async function processRepoContext(
	resolved: RepoContext,
	roots: DestinationRoots,
	options: ProcessInputOptions,
	gitOps: GitOps = defaultGitOps,
): Promise<boolean> {
	try {
		if (options.doArchlist) {
			const archlistPath = join(homedir(), "archlist")
			await appendFile(archlistPath, `${resolved.cloneUrl}\n`)
		}

		if (options.doArchive) {
			await syncArchive(resolved, roots, gitOps)
		}

		if (options.doWiki) {
			await syncWiki(resolved, roots, options, gitOps)
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

export function createProcessEntry(
	repoExtension: RepoExtension,
	roots: DestinationRoots,
	options: ProcessInputOptions,
	gitOps: GitOps = defaultGitOps,
): (input: string) => Promise<boolean> {
	return async (input: string) => {
		try {
			const resolved = await repoExtension.resolve(input)
			return await processRepoContext(resolved, roots, options, gitOps)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(message)
			return true
		}
	}
}
