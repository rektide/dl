import { plugin } from "gunshi/plugin"
import { LOG_PLUGIN_ID, type LogExtension } from "./log.ts"
import { clipboardSource, type InputSource } from "../command/input.ts"

export const CLIPBOARD_INPUT_PLUGIN_ID = "rekon:input:clipboard" as const

export interface ClipboardInputExtension {
	active: boolean
	source: () => InputSource
}

const dependencies = [LOG_PLUGIN_ID] as const

export const clipboardInputPlugin = plugin<
	{ [LOG_PLUGIN_ID]: LogExtension },
	typeof CLIPBOARD_INPUT_PLUGIN_ID,
	typeof dependencies,
	ClipboardInputExtension
>({
	id: CLIPBOARD_INPUT_PLUGIN_ID,
	name: "Rekon Clipboard Input",
	dependencies,
	setup: (ctx) => {
		ctx.addGlobalOption("clipboard", {
			type: "boolean",
			default: false,
			description: "Watch system clipboard for URLs and process them serially",
		})
	},
	extension: (ctx): ClipboardInputExtension => {
		const log = ctx.extensions[LOG_PLUGIN_ID]
		const values = ctx.values as { clipboard?: boolean } // gunshi: plugin-registered global
		return {
			active: !!values.clipboard,
			source: () => clipboardSource(log),
		}
	},
})
