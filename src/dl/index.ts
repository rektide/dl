import type { DexportOps } from "../dexport/types.ts"
import type { GitOps } from "../git/types.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "./types.ts"
import type { ActionHandler } from "./pipeline.ts"
import { runPipeline } from "./pipeline.ts"
import type { LogExtension } from "../plugin/log.ts"

export async function processRepoContext(
	resolved: RepoContext,
	ctx: DlContext,
	handlers: readonly ActionHandler[],
): Promise<boolean> {
	return runPipeline(
		resolved,
		ctx,
		handlers,
		ctx.options.reportLifecycle,
		ctx.log,
	)
}

export function createProcessEntry(
	handlers: readonly ActionHandler[],
	repoExtension: import("../plugin/repo.ts").RepoExtension,
	roots: DlContext["roots"],
	options: import("./types.ts").DlOptions,
	log: LogExtension,
): (input: string) => Promise<boolean> {
	return async (input: string) => {
		try {
			const ctx: DlContext = { roots, options, log }
			let hadError = false
			let found = false
			for await (const resolved of repoExtension.resolve(input)) {
				found = true
				hadError = (await processRepoContext(resolved, ctx, handlers)) || hadError
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
