import { join } from "node:path"
import type { DlContext } from "../dl/types.ts"
import type { RepoContext } from "../repo/context.ts"
import { defaultDexportOps } from "../dexport/default.ts"
import type { DexportOps } from "../dexport/types.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"
import { syncGitWiki } from "./git.ts"

export async function syncWiki(
	resolved: RepoContext,
	ctx: DlContext,
	gitOps: GitOps = defaultGitOps,
	dexportOps: DexportOps = defaultDexportOps,
): Promise<void> {
	const pathname = resolved.url!.pathname.replace(/^\//, "")
	const wikiDestination = join(ctx.roots.wikiRoot, pathname)
	ctx.log.info("sync", "wiki", { destination: wikiDestination })
	await dexportOps.sync(resolved, ctx.roots, ctx.options, wikiDestination, ctx.log)

	if (resolved.wikiRepoUrl) {
		await syncGitWiki(resolved, wikiDestination, gitOps, ctx.log)
	}
}
