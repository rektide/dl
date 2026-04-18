import { ENSURE, OFF } from "../action/state.ts"
import type { DlActionSpec } from "../action/registry.ts"
import type { LifecycleReporter } from "../action/lifecycle.ts"
import type { ActionHandler, ActionResult } from "../action/handler.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "../action/types.ts"
import { syncDexportWiki } from "../dexport/sync.ts"
import { defaultDexportOps } from "../dexport/default.ts"
import { join } from "node:path"

const DEEPWIKI_STATES = [ENSURE, OFF] as const

export const DEEPWIKI_ACTION_SPEC: DlActionSpec = {
	name: "deepwiki",
	description: "Deepwiki (dexport) sync action",
	defaultState: ENSURE,
	states: DEEPWIKI_STATES,
	optionKey: "deepwikiState",
}

export const DEEPWIKI_ACTION_FLAG_OPTION = {
	type: "boolean",
	default: false,
	description: "Deepwiki sync action (bare --deepwiki uses default state 'ensure')",
} as const

export const DEEPWIKI_ACTION_STATE_OPTION = {
	type: "enum",
	choices: DEEPWIKI_STATES,
	description: "Deepwiki sync action state (ensure|off)",
} as const

async function runDeepwiki(
	resolved: RepoContext,
	ctx: DlContext,
	lifecycle: LifecycleReporter,
): Promise<ActionResult> {
	if (ctx.options.deepwikiState === OFF) {
		lifecycle.skipped({ step: "wiki-dexport", source: "deepwikiHandler", transition: "off" })
		return { hadError: false }
	}

	const pathname = resolved.url!.pathname.replace(/^\//, "")
	const wikiDestination = join(ctx.roots.wikiRoot, pathname)

	const dexportOps = ctx.dexportOps ?? defaultDexportOps
	const report = await dexportOps.sync(resolved, ctx.roots, ctx.options, wikiDestination, ctx.log)

	if (report.status === "failed") {
		lifecycle.failed({
			step: "wiki-dexport",
			source: "deepwikiHandler -> dexportOps.sync",
			transition: report.status,
			details: { plan: report.plan, reason: report.reason, destination: wikiDestination },
		})
		return { hadError: true }
	}

	if (report.status === "skipped") {
		lifecycle.skipped({
			step: "wiki-dexport",
			source: "deepwikiHandler -> dexportOps.sync",
			transition: report.status,
			details: { plan: report.plan, reason: report.reason, destination: wikiDestination },
		})
		return { hadError: false }
	}

	lifecycle.ok({
		step: "wiki-dexport",
		source: "deepwikiHandler -> dexportOps.sync",
		transition: report.status,
		details: { plan: report.plan, reason: report.reason, destination: wikiDestination },
	})
	return { hadError: false }
}

export const deepwikiHandler: ActionHandler = {
	id: "deepwiki",
	run: runDeepwiki,
}
