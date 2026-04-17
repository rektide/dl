import { ENSURE, OFF } from "./actions.ts"
import type { DlActionSpec } from "./action-registry.ts"
import type { LifecycleReporter } from "./lifecycle.ts"
import type { ActionHandler, ActionResult } from "./pipeline.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "./types.ts"
import { syncGitWiki } from "../wiki/git.ts"
import { join } from "node:path"

const WIKI_STATES = [ENSURE, OFF] as const

export const WIKI_ACTION_SPEC: DlActionSpec = {
	name: "wiki",
	description: "Wiki git checkout action",
	defaultState: ENSURE,
	states: WIKI_STATES,
	optionKey: "wikiState",
}

export const WIKI_ACTION_FLAG_OPTION = {
	type: "boolean",
	default: false,
	description: "Wiki git checkout action (bare --wiki uses default state 'ensure')",
} as const

export const WIKI_ACTION_STATE_OPTION = {
	type: "enum",
	choices: WIKI_STATES,
	description: "Wiki git checkout action state (ensure|off)",
} as const

async function runWiki(
	resolved: RepoContext,
	ctx: DlContext,
	lifecycle: LifecycleReporter,
): Promise<ActionResult> {
	if (ctx.options.wikiState === OFF) {
		lifecycle.skipped({ step: "wiki-git", source: "wikiHandler", transition: "off" })
		return { hadError: false }
	}

	if (!resolved.wikiRepoUrl) {
		lifecycle.skipped({
			step: "wiki-git",
			source: "wikiHandler",
			transition: "not-applicable",
			details: { reason: "no wiki repository URL for this host" },
		})
		return { hadError: false }
	}

	const pathname = resolved.url!.pathname.replace(/^\//, "")
	const wikiDestination = join(ctx.roots.wikiRoot, pathname)
	ctx.log.info("sync", "wiki", { destination: wikiDestination })

	try {
		const report = await syncGitWiki(resolved, wikiDestination, undefined, ctx.log)
		if (report.status === "failed") {
			lifecycle.failed({
				step: "wiki-git",
				source: "wikiHandler -> syncGitWiki",
				transition: "failed",
				details: { message: report.message, destination: wikiDestination },
			})
			return { hadError: true }
		}
		lifecycle.ok({
			step: "wiki-git",
			source: "wikiHandler -> syncGitWiki",
			transition: report.status,
			details: { destination: wikiDestination },
		})
		return { hadError: false }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		lifecycle.failed({
			step: "wiki-git",
			source: "wikiHandler",
			transition: "error",
			details: { message },
		})
		return { hadError: true }
	}
}

export const wikiHandler: ActionHandler = {
	id: "wiki",
	run: runWiki,
}
