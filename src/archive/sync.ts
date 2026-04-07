import { join } from "node:path"
import type { DlContext } from "../dl/types.ts"
import type { RepoContext } from "../repo/context.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitCloneStatus, GitOps, JjInitStatus } from "../git/types.ts"

export type ArchiveSyncReport = {
	readonly destination: string
	readonly archiveStatus: GitCloneStatus
	readonly jjStatus: JjInitStatus
}

export async function syncArchive(
	resolved: RepoContext,
	ctx: DlContext,
	gitOps: GitOps = defaultGitOps,
): Promise<ArchiveSyncReport> {
	const pathname = resolved.url!.pathname.replace(/^\//, "")
	const archiveDestination = join(ctx.roots.archiveRoot, pathname)
	ctx.log.info("sync", "archive", { destination: archiveDestination })
	const archiveStatus = await gitOps.cloneOrUpdate(resolved.url!.toString(), archiveDestination)
	const jjStatus = await gitOps.ensureJjInitialized(archiveDestination)

	return {
		destination: archiveDestination,
		archiveStatus,
		jjStatus,
	}
}
