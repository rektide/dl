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

export const resolveStreamPlugin = plugin({
	id: RESOLVE_STREAM_PLUGIN_ID,
	name: "Rekon Resolve Stream",
	extension: (ctx): ResolveStreamExtension => {
		const extensions = ctx.extensions as Record<string, unknown>
		const repo = extensions[REPO_PLUGIN_ID] as RepoExtension
		const log = extensions[LOG_PLUGIN_ID] as LogExtension

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
