import { join } from "node:path"
import type { DestinationRoots } from "../dl/types.ts"
import type { RepoContext } from "../repo/context.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"

export async function syncArchive(
	resolved: RepoContext,
	roots: DestinationRoots,
	gitOps: GitOps = defaultGitOps,
): Promise<void> {
	const archiveDestination = join(roots.archiveRoot, resolved.namespacePath!)
	console.log(`archive: ${archiveDestination}`)
	await gitOps.cloneOrUpdate(resolved.url!.toString(), archiveDestination)
	await gitOps.ensureJjInitialized(archiveDestination)
}
