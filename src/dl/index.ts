import { appendFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { syncArchive } from "../archive/sync.ts"
import { defaultDexportOps } from "../dexport/default.ts"
import type { DexportOps } from "../dexport/types.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"
import type { RepoContext } from "../repo/context.ts"
import type { RepoExtension } from "../plugin/repo.ts"
import { syncWiki } from "../wiki/sync.ts"
import type { DlOptions, DlContext } from "./types.ts"
import type { LogExtension } from "../plugin/log.ts"

export async function processRepoContext(
	resolved: RepoContext,
	ctx: DlContext,
	gitOps: GitOps = defaultGitOps,
	dexportOps: DexportOps = defaultDexportOps,
): Promise<boolean> {
	try {
		const pathname = resolved.url?.pathname?.replace(/^\//, "")
		if (ctx.options.dryRun) {
			ctx.log.info("dry-run", "would_sync", {
				url: resolved.url?.toString(),
				pathname,
				doArchive: ctx.options.doArchive,
				doWiki: ctx.options.doWiki,
				archivePath: ctx.options.doArchive && pathname
					? `${ctx.roots.archiveRoot}/${pathname}`
					: undefined,
				wikiPath: ctx.options.doWiki && pathname
					? `${ctx.roots.wikiRoot}/${pathname}`
					: undefined,
			})
			return false
		}

		if (ctx.options.doArchlist) {
			const archlistPath = join(homedir(), "archlist")
			ctx.log.info("sync", "archlist", { url: resolved.url!.toString(), path: archlistPath })
			await appendFile(archlistPath, `${resolved.url!.toString()}\n`)
		}

		if (ctx.options.doArchive) {
			await syncArchive(resolved, ctx, gitOps)
		}

		if (ctx.options.doWiki) {
			await syncWiki(resolved, ctx, gitOps, dexportOps)
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
	roots: DlContext["roots"],
	options: DlOptions,
	log: LogExtension,
	gitOps: GitOps = defaultGitOps,
	dexportOps: DexportOps = defaultDexportOps,
): (input: string) => Promise<boolean> {
	return async (input: string) => {
		try {
			const ctx: DlContext = { roots, options, log }
			let hadError = false
			let found = false
			for await (const resolved of repoExtension.resolve(input)) {
				found = true
				hadError = (await processRepoContext(resolved, ctx, gitOps, dexportOps)) || hadError
			}
			if (!found) {
				log.warn("sync", "no_match", { input })
			}
			return hadError
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			log.error("sync", "failed", { message })
			return true
		}
	}
}
