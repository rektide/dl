import { appendFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { syncArchive } from "../archive/sync.ts"
import { defaultDexportOps } from "../dexport/default.ts"
import type { DexportOps } from "../dexport/types.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"
import {
	linkSpecificProject,
} from "../repo/link.ts"
import type { RepoContext } from "../repo/context.ts"
import type { RepoExtension } from "../plugin/repo.ts"
import { syncWiki } from "../wiki/sync.ts"
import type {
	DestinationRoots,
	ProcessInputOptions,
	DlContext,
} from "./types.ts"
import type { LogExtension } from "../plugin/log.ts"

export async function processRepoContext(
	resolved: RepoContext,
	ctx: DlContext,
	gitOps: GitOps = defaultGitOps,
	dexportOps: DexportOps = defaultDexportOps,
): Promise<boolean> {
	try {
		if (ctx.options.doArchlist) {
			const archlistPath = join(homedir(), "archlist")
			await appendFile(archlistPath, `${resolved.url!.toString()}\n`)
		}

		if (ctx.options.doArchive) {
			await syncArchive(resolved, ctx, gitOps)
		}

		if (ctx.options.doWiki) {
			await syncWiki(resolved, ctx, gitOps, dexportOps)
		}

		if (ctx.options.doArchive && ctx.options.doWiki) {
			const linkErrors = await linkSpecificProject({
				archiveRoot: ctx.roots.archiveRoot,
				wikiRoot: ctx.roots.wikiRoot,
				namespacePath: resolved.namespacePath!,
				onEvent: (event, useErrorStream = false) => {
					if (!event.status.startsWith("error")) {
						return
					}
					const line = JSON.stringify(event)
					const stream = useErrorStream ? ctx.log.getErrorStream() : ctx.log.getOutputStream()
					stream.write(line + "\n")
				},
			})
			if (linkErrors) {
				return true
			}
		}

		return false
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		ctx.log.error("sync", "failed", { message })
		return true
	}
}

export function createProcessEntry(
	repoExtension: RepoExtension,
	roots: DestinationRoots,
	options: ProcessInputOptions,
	log: LogExtension,
	gitOps: GitOps = defaultGitOps,
	dexportOps: DexportOps = defaultDexportOps,
): (input: string) => Promise<boolean> {
	return async (input: string) => {
		try {
			const ctx: DlContext = { roots, options, log }
			let hadError = false
			for await (const resolved of repoExtension.resolve(input)) {
				hadError = (await processRepoContext(resolved, ctx, gitOps, dexportOps)) || hadError
			}
			return hadError
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			log.error("sync", "failed", { message })
			return true
		}
	}
}
