import { OFF, ENSURE, FORCE, type StepState } from "./actions.ts"
import { syncSimplify } from "../simplify/index.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "./types.ts"
import type { LifecycleReporter } from "./lifecycle.ts"
import type { ActionHandler, ActionResult } from "./pipeline.ts"

export async function runSymlink(
	resolved: RepoContext,
	ctx: DlContext,
	lifecycle: LifecycleReporter,
): Promise<ActionResult> {
	if (!ctx.options.doSymlink || ctx.options.symlinkState === OFF) {
		lifecycle.skipped({ step: "symlink-org", source: "symlinkHandler", transition: "off" })
		lifecycle.skipped({ step: "symlink-repo", source: "symlinkHandler", transition: "off" })
		return { hadError: false }
	}

	const simplifyReport = await syncSimplify(resolved, ctx)

	if (simplifyReport.orgStatus === "skipped") {
		lifecycle.skipped({ step: "symlink-org", source: "symlinkHandler", transition: simplifyReport.orgStatus })
	} else {
		lifecycle.ok({ step: "symlink-org", source: "symlinkHandler -> ensureSymlink", transition: simplifyReport.orgStatus, details: { org: simplifyReport.org } })
	}

	if (simplifyReport.projectStatus === "skipped") {
		lifecycle.skipped({ step: "symlink-repo", source: "symlinkHandler", transition: simplifyReport.projectStatus })
	} else {
		lifecycle.ok({ step: "symlink-repo", source: "symlinkHandler -> ensureSymlink", transition: simplifyReport.projectStatus, details: { org: simplifyReport.org, project: simplifyReport.project } })
	}

	return { hadError: false }
}

export const symlinkHandler: ActionHandler = {
	id: "symlink",
	run: runSymlink,
}
