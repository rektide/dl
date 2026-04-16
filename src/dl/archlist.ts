import { appendFile, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { StepState } from "./actions.ts"
import type { LifecycleReporter } from "./lifecycle.ts"
import type { LogExtension } from "../plugin/log.ts"

export type ArchlistDecision =
	| { action: "append" }
	| { action: "already_present" }
	| { action: "skip" }

export function decideArchlist(
	archlistState: StepState,
	url: string,
	fileContent: string | null,
): ArchlistDecision {
	if (archlistState === "off") return { action: "skip" }

	if (archlistState === "ensure") {
		if (fileContent !== null) {
			const lines = fileContent.split("\n")
			if (lines.includes(url)) {
				return { action: "already_present" }
			}
		}
	}

	return { action: "append" }
}

export type ArchlistResult = {
	readonly transition: string
	readonly hadError: boolean
}

export async function syncArchlist(
	url: string,
	archlistState: StepState,
	lifecycle: LifecycleReporter,
	log: LogExtension,
	archlistPath?: string,
): Promise<ArchlistResult> {
	const resolvedPath = archlistPath ?? join(homedir(), "archlist")

	if (archlistState === "off") {
		lifecycle.skipped({
			step: "archlist",
			source: "syncArchlist",
			transition: "off",
		})
		return { transition: "off", hadError: false }
	}

	log.info("sync", "archlist", { url, path: resolvedPath, state: archlistState })

	let fileContent: string | null = null
	try {
		fileContent = await readFile(resolvedPath, "utf-8")
	} catch {
		// file doesn't exist yet
	}

	const decision = decideArchlist(archlistState, url, fileContent)

	if (decision.action === "skip") {
		lifecycle.skipped({
			step: "archlist",
			source: "syncArchlist",
			transition: "off",
		})
		return { transition: "off", hadError: false }
	}

	if (decision.action === "already_present") {
		lifecycle.ok({
			step: "archlist",
			source: "syncArchlist -> readFile",
			transition: "already_present",
			details: { path: resolvedPath },
		})
		return { transition: "already_present", hadError: false }
	}

	try {
		await appendFile(resolvedPath, `${url}\n`)
		lifecycle.ok({
			step: "archlist",
			source: "syncArchlist -> appendFile",
			transition: "appended",
			details: { path: resolvedPath },
		})
		return { transition: "appended", hadError: false }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		log.error("sync", "archlist_failed", { message })
		lifecycle.failed({
			step: "archlist",
			source: "syncArchlist -> appendFile",
			transition: "error",
			details: { message },
		})
		return { transition: "error", hadError: true }
	}
}
