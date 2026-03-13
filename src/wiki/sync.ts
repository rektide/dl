import { join } from "node:path"
import type { DestinationRoots, ProcessInputOptions, RepoContext } from "../dl/types.ts"
import { defaultDexportOps } from "../dexport/default.ts"
import type { DexportOps } from "../dexport/types.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"
import { syncGitWiki } from "./git.ts"

export async function syncWiki(
	resolved: RepoContext,
	roots: DestinationRoots,
	options: ProcessInputOptions,
	gitOps: GitOps = defaultGitOps,
	dexportOps: DexportOps = defaultDexportOps,
): Promise<void> {
	const wikiDestination = join(roots.wikiRoot, resolved.namespacePath)
	console.log(`wiki: ${wikiDestination}`)
	await dexportOps.sync(resolved, roots, options, wikiDestination)

	if (resolved.host !== "github.com") {
		await syncGitWiki(resolved, wikiDestination, gitOps)
	}
}
