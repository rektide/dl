import { appendFile, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { OFF, ENSURE, type StepState } from "./actions.ts"
import type { LifecycleReporter } from "./lifecycle.ts"
import type { LogExtension } from "../plugin/log.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "./types.ts"
import type { ActionHandler, ActionResult } from "./pipeline.ts"

export type ArchlistDecision =
	| { action: "append" }
	| { action: "already_present" }
	| { action: "skip" }

export function decideArchlist(
	archlistState: StepState,
	url: string,
	fileContent: string | null,
): ArchlistDecision {
	if (archlistState === OFF) return { action: "skip" }

	if (archlistState === ENSURE) {
		if (fileContent !== null) {
			const lines = fileContent.split("\n")
			if (lines.includes(url)) {
				return { action: "already_present" }
			}
		}
	}

	return { action: "append" }
}

export async function syncArchlist(
	url: string,
	archlistState: StepState,
	lifecycle: LifecycleReporter,
	log: LogExtension,
	archlistPath?: string,
): Promise<ActionResult> {
	const resolvedPath = archlistPath ?? join(homedir(), "archlist")

	if (archlistState === OFF) {
		lifecycle.skipped({
			step: "archlist",
			source: "syncArchlist",
			transition: "off",
		})
		return { hadError: false }
	}

	log.info("sync", "archlist", { url, path: resolvedPath, state: archlistState })

	let fileContent: string | null = null
	try {
		fileContent = await readFile(resolvedPath, "utf-8")
	} catch {
	}

	const decision = decideArchlist(archlistState, url, fileContent)

	if (decision.action === "skip") {
		lifecycle.skipped({
			step: "archlist",
			source: "syncArchlist",
			transition: "off",
		})
		return { hadError: false }
	}

	if (decision.action === "already_present") {
		lifecycle.ok({
			step: "archlist",
			source: "syncArchlist -> readFile",
			transition: "already_present",
			details: { path: resolvedPath },
		})
		return { hadError: false }
	}

	try {
		await appendFile(resolvedPath, `${url}\n`)
		lifecycle.ok({
			step: "archlist",
			source: "syncArchlist -> appendFile",
			transition: "appended",
			details: { path: resolvedPath },
		})
		return { hadError: false }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		log.error("sync", "archlist_failed", { message })
		lifecycle.failed({
			step: "archlist",
			source: "syncArchlist -> appendFile",
			transition: "error",
			details: { message },
		})
		return { hadError: true }
	}
}

export const archlistHandler: ActionHandler = {
	id: "archlist",
	run: async (resolved: RepoContext, ctx: DlContext, lifecycle: LifecycleReporter): Promise<ActionResult> => {
		return syncArchlist(
			resolved.url!.toString(),
			ctx.options.archlistState,
			lifecycle,
			ctx.log,
		)
	},
}
