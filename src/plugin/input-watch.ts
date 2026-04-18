import { plugin } from "gunshi/plugin"
import { LOG_PLUGIN_ID, type LogExtension } from "./log.ts"
import { watchSource, type InputSource } from "../command/input.ts"

export const WATCH_INPUT_PLUGIN_ID = "rekon:input:watch" as const

export interface WatchInputExtension {
	active: boolean
	source: () => InputSource
}

const dependencies = [LOG_PLUGIN_ID] as const

export const watchInputPlugin = plugin<
	{ [LOG_PLUGIN_ID]: LogExtension },
	typeof WATCH_INPUT_PLUGIN_ID,
	typeof dependencies,
	WatchInputExtension
>({
	id: WATCH_INPUT_PLUGIN_ID,
	name: "Rekon Watch Input",
	dependencies,
	setup: (ctx) => {
		ctx.addGlobalOption("watch", {
			type: "boolean",
			default: false,
			description: "Watch ~/archlist and process appended entries serially",
		})
	},
	extension: (ctx): WatchInputExtension => {
		const log = ctx.extensions[LOG_PLUGIN_ID]
		const values = ctx.values as { watch?: boolean } // gunshi: plugin-registered global
		return {
			active: !!values.watch,
			source: () => watchSource(log),
		}
	},
})
