import { join } from "node:path"
import type { DestinationRoots, ProcessInputOptions, RepoContext } from "../dl/types.ts"
import { syncGithubWiki } from "./dexport/sync.ts"
import { syncGitWiki } from "./git.ts"

export async function syncWiki(
	resolved: RepoContext,
	roots: DestinationRoots,
	options: ProcessInputOptions,
): Promise<void> {
	const wikiDestination = join(roots.wikiRoot, resolved.namespacePath)
	console.log(`wiki: ${wikiDestination}`)

	if (resolved.host === "github.com") {
		await syncGithubWiki(resolved, roots, options, wikiDestination)
		return
	}

	await syncGitWiki(resolved, wikiDestination)
}
