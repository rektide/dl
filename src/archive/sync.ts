import { join } from "node:path"
import type { DestinationRoots, ResolvedRepo } from "../dl/types.ts"
import { cloneOrUpdate } from "../git/clone.ts"
import { ensureJjInitialized } from "../git/jj.ts"

export async function syncArchive(
	resolved: ResolvedRepo,
	roots: DestinationRoots,
): Promise<void> {
	const archiveDestination = join(roots.archiveRoot, resolved.namespacePath)
	console.log(`archive: ${archiveDestination}`)
	await cloneOrUpdate(resolved.cloneUrl, archiveDestination)
	await ensureJjInitialized(archiveDestination)
}
