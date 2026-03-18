import { join } from "node:path"
import type { DestinationRoots, ProcessInputOptions } from "../dl/types.ts"
import type { RepoContext } from "../repo/context.ts"
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
	const wikiDestination = join(roots.wikiRoot, resolved.namespacePath!)
	console.log(`wiki: ${wikiDestination}`)
	await dexportOps.sync(resolved, roots, options, wikiDestination)

	if (resolved.wikiGitUrl) {
		await syncGitWiki(resolved, wikiDestination, gitOps)
	}
}
