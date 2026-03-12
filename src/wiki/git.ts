import type { ResolvedRepo } from "../dl/types.ts"
import { cloneOrUpdate } from "../git/clone.ts"

export async function syncGitWiki(
	resolved: ResolvedRepo,
	wikiDestination: string,
): Promise<void> {
	try {
		await cloneOrUpdate(resolved.wikiCloneUrl, wikiDestination)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.warn(`wiki fetch skipped: ${message}`)
	}
}
