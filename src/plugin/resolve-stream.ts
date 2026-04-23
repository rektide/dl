import { plugin } from "gunshi/plugin"
import { LOG_PLUGIN_ID, type LogExtension } from "./log.ts"
import { REPO_PLUGIN_ID, type RepoExtension } from "./repo.ts"
import type { RepoContext } from "../repo/context.ts"

export const RESOLVE_STREAM_PLUGIN_ID = "rekon:resolve-stream" as const

export type ResolveEvent =
	| { type: "candidate"; input: string; context: RepoContext }
	| { type: "resolved"; input: string; context: RepoContext }

export interface ResolveStreamExtension {
	resolveStream(inputs: AsyncIterable<string>): AsyncGenerator<ResolveEvent>
}

const dependencies = [REPO_PLUGIN_ID, LOG_PLUGIN_ID] as const

export const resolveStreamPlugin = plugin<
	{ [REPO_PLUGIN_ID]: RepoExtension; [LOG_PLUGIN_ID]: LogExtension },
	typeof RESOLVE_STREAM_PLUGIN_ID,
	typeof dependencies,
	ResolveStreamExtension
>({
	id: RESOLVE_STREAM_PLUGIN_ID,
	name: "Rekon Resolve Stream",
	dependencies,
	setup: (ctx) => {
		ctx.addGlobalOption("candidates", {
			type: "boolean",
			default: false,
			description: "Print expanded candidate URLs before verification (no network calls)",
		})
		ctx.addGlobalOption("verified", {
			type: "boolean",
			default: false,
			description: "Output verified repo info without syncing",
		})
		ctx.addGlobalOption("dry-run", {
			type: "boolean",
			default: false,
			description: "Show what would be done without making changes",
		})
		ctx.addGlobalOption("report-lifecycle", {
			type: "boolean",
			default: false,
			description: "Emit structured lifecycle summary per resolved repository",
		})
	},
	extension: (ctx): ResolveStreamExtension => {
		const repo = ctx.extensions[REPO_PLUGIN_ID]
		const log = ctx.extensions[LOG_PLUGIN_ID]

		async function* resolveStream(inputs: AsyncIterable<string>): AsyncGenerator<ResolveEvent> {
			for await (const input of inputs) {
				let candidateFound = false
				for await (const candidate of repo.candidates(input)) {
					candidateFound = true
					yield { type: "candidate", input, context: candidate }
				}

				let resolvedFound = false
				for await (const resolved of repo.resolve(input)) {
					resolvedFound = true
					yield { type: "resolved", input, context: resolved }
				}

				if (!candidateFound && !resolvedFound) {
					log.warn("resolve", "no_match", { input })
				}
			}
		}

		return { resolveStream }
	},
})
