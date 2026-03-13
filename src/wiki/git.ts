import type { RepoContext } from "../dl/types.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"

export async function syncGitWiki(
	resolved: RepoContext,
	wikiDestination: string,
	gitOps: GitOps = defaultGitOps,
): Promise<void> {
	try {
		await gitOps.cloneOrUpdate(resolved.wikiCloneUrl, wikiDestination)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.warn(`wiki fetch skipped: ${message}`)
	}
}
