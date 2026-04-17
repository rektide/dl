import { ENSURE, OFF } from "./actions.ts"
import type { DlActionSpec } from "./action-registry.ts"
import type { LifecycleReporter } from "./lifecycle.ts"
import type { ActionHandler, ActionResult } from "./pipeline.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "./types.ts"
import { syncArchive } from "../archive/sync.ts"

const ARCHIVE_STATES = [ENSURE, OFF] as const

export const ARCHIVE_ACTION_SPEC: DlActionSpec = {
	name: "archive",
	description: "Archive checkout action",
	defaultState: ENSURE,
	states: ARCHIVE_STATES,
	optionKey: "archiveState",
}

export const ARCHIVE_ACTION_FLAG_OPTION = {
	type: "boolean",
	default: false,
	description: "Archive checkout action (bare --archive uses default state 'ensure')",
} as const

export const ARCHIVE_ACTION_STATE_OPTION = {
	type: "enum",
	choices: ARCHIVE_STATES,
	description: "Archive checkout action state (ensure|off)",
} as const

async function runArchive(
	resolved: RepoContext,
	ctx: DlContext,
	lifecycle: LifecycleReporter,
): Promise<ActionResult> {
	if (ctx.options.archiveState === OFF) {
		lifecycle.skipped({ step: "archive", source: "archiveHandler", transition: "off" })
		lifecycle.skipped({ step: "archive-jj", source: "archiveHandler", transition: "off" })
		return { hadError: false }
	}

	try {
		const report = await syncArchive(resolved, ctx)
		lifecycle.ok({
			step: "archive",
			source: "archiveHandler -> syncArchive",
			transition: report.archiveStatus,
			details: { destination: report.destination },
		})
		lifecycle.ok({
			step: "archive-jj",
			source: "archiveHandler -> ensureJjInitialized",
			transition: report.jjStatus,
			details: { destination: report.destination },
		})
		return { hadError: false }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		lifecycle.failed({
			step: "archive",
			source: "archiveHandler",
			transition: "error",
			details: { message },
		})
		lifecycle.failed({
			step: "archive-jj",
			source: "archiveHandler",
			transition: "blocked",
			details: { message: "archive sync failed before jj initialization" },
		})
		return { hadError: true }
	}
}

export const archiveHandler: ActionHandler = {
	id: "archive",
	run: runArchive,
}
