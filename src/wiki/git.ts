import type { RepoContext } from "../repo/context.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"

export async function syncGitWiki(
	resolved: RepoContext,
	wikiDestination: string,
	gitOps: GitOps = defaultGitOps,
): Promise<void> {
	try {
		await gitOps.cloneOrUpdate(resolved.wikiGitUrl!.toString(), wikiDestination)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.warn(`wiki fetch skipped: ${message}`)
	}
}
