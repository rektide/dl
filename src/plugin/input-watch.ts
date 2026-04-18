import { plugin } from "gunshi/plugin"
import { LOG_PLUGIN_ID, type LogExtension } from "./log.ts"
import { watchSource, type InputSource } from "../command/input.ts"

export const WATCH_INPUT_PLUGIN_ID = "rekon:input:watch" as const

export interface WatchInputExtension {
	active: boolean
	source: () => InputSource
}

export const watchInputPlugin = plugin({
	id: WATCH_INPUT_PLUGIN_ID,
	name: "Rekon Watch Input",
	setup: (ctx) => {
		ctx.addGlobalOption("watch", {
			type: "boolean",
			default: false,
			description: "Watch ~/archlist and process appended entries serially",
		})
	},
	extension: (ctx): WatchInputExtension => {
		const extensions = ctx.extensions as Record<string, unknown>
		const log = extensions[LOG_PLUGIN_ID] as LogExtension
		const values = ctx.values as { watch?: boolean }
		return {
			active: !!values.watch,
			source: () => watchSource(log),
		}
	},
})
