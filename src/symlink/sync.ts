import { join } from "node:path"
import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "../action/types.ts"
import { simplify } from "./simplify.ts"
import { ensureSymlink, type SimplifyStatus } from "./ensure.ts"

export type SimplifySyncReport = {
	readonly orgStatus: SimplifyStatus | "skipped"
	readonly projectStatus: SimplifyStatus | "skipped"
	readonly org: string | null
	readonly project: string | null
}

/**
 * Given a resolved repo context, create org-level and repo-level simplified
 * symlinks under the archive root. Runs as a step in the dl pipeline after
 * {@link syncArchive} so the real directory exists.
 */
export async function syncSimplify(
	resolved: RepoContext,
	ctx: DlContext,
): Promise<SimplifySyncReport> {
	if (!resolved.url) {
		return {
			orgStatus: "skipped",
			projectStatus: "skipped",
			org: null,
			project: null,
		}
	}

	const segments = resolved.url.pathname.replace(/^\//, "").split("/")
	if (segments.length < 2) {
		return {
			orgStatus: "skipped",
			projectStatus: "skipped",
			org: null,
			project: null,
		}
	}

	const org = segments[0]
	const project = segments[1].replace(/\.git$/, "")

	const simplifiedOrg = simplify(org)
	const simplifiedProject = simplify(project)
	const dryRun = ctx.options.dryRun
	const anycase = ctx.options.anycase ?? false

	const orgStatus = await ensureSymlink(ctx.roots.archiveRoot, org, simplifiedOrg, dryRun, ctx.log, anycase)

	const orgDir = join(ctx.roots.archiveRoot, org)
	const projectStatus = await ensureSymlink(orgDir, project, simplifiedProject, dryRun, ctx.log, anycase)

	return {
		orgStatus,
		projectStatus,
		org,
		project,
	}
}
