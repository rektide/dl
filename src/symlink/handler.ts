import { ENSURE, OFF } from "../action/state.ts"
import type { DlActionSpec } from "../action/registry.ts"
import type { LifecycleReporter } from "../action/lifecycle.ts"
import type { ActionHandler, ActionResult } from "../action/handler.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "../action/types.ts"
import { syncSimplify } from "./sync.ts"

const SYMLINK_STATES = [ENSURE, OFF] as const

export const SYMLINK_ACTION_SPEC: DlActionSpec = {
	name: "symlink",
	description: "Symlink creation action",
	defaultState: ENSURE,
	states: SYMLINK_STATES,
	optionKey: "symlinkState",
}

export const SYMLINK_ACTION_FLAG_OPTION = {
	type: "boolean",
	default: false,
	description: "Symlink creation action (bare --symlink uses default state 'ensure')",
} as const

export const SYMLINK_ACTION_STATE_OPTION = {
	type: "enum",
	choices: SYMLINK_STATES,
	description: "Symlink creation action state (ensure|off)",
} as const

export async function runSymlink(
	resolved: RepoContext,
	ctx: DlContext,
	lifecycle: LifecycleReporter,
): Promise<ActionResult> {
	if (ctx.options.symlinkState === OFF) {
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
