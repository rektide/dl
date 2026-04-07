import { join } from "node:path"
import type { DlContext } from "../dl/types.ts"
import type { RepoContext } from "../repo/context.ts"
import { defaultDexportOps } from "../dexport/default.ts"
import type { DexportOps, DexportSyncReport } from "../dexport/types.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"
import { syncGitWiki, type GitWikiSyncReport } from "./git.ts"

export type WikiSyncReport = {
	readonly destination: string
	readonly dexport: DexportSyncReport
	readonly gitWiki: GitWikiSyncReport | { readonly status: "not-applicable"; readonly reason: string }
}

export async function syncWiki(
	resolved: RepoContext,
	ctx: DlContext,
	gitOps: GitOps = defaultGitOps,
	dexportOps: DexportOps = defaultDexportOps,
): Promise<WikiSyncReport> {
	const pathname = resolved.url!.pathname.replace(/^\//, "")
	const wikiDestination = join(ctx.roots.wikiRoot, pathname)
	ctx.log.info("sync", "wiki", { destination: wikiDestination })
	const dexport = await dexportOps.sync(resolved, ctx.roots, ctx.options, wikiDestination, ctx.log)
	const gitWiki = resolved.wikiRepoUrl
		? await syncGitWiki(resolved, wikiDestination, gitOps, ctx.log)
		: { status: "not-applicable", reason: "no wiki repository URL for this host" } as const

	return {
		destination: wikiDestination,
		dexport,
		gitWiki,
	}
}
