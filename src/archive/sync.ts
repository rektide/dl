import { join } from "node:path"
import type { DlContext } from "../dl/types.ts"
import type { RepoContext } from "../repo/context.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"

export async function syncArchive(
	resolved: RepoContext,
	ctx: DlContext,
	gitOps: GitOps = defaultGitOps,
): Promise<void> {
	const archiveDestination = join(ctx.roots.archiveRoot, resolved.namespacePath!)
	ctx.log.info("sync", "archive", { destination: archiveDestination })
	await gitOps.cloneOrUpdate(resolved.url!.toString(), archiveDestination)
	await gitOps.ensureJjInitialized(archiveDestination)
}
