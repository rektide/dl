import { plugin } from "gunshi/plugin"
import { LOG_PLUGIN_ID, type LogExtension } from "./log.ts"
import { clipboardSource, type InputSource } from "../command/input.ts"

export const CLIPBOARD_INPUT_PLUGIN_ID = "rekon:input:clipboard" as const

export interface ClipboardInputExtension {
	active: boolean
	source: () => InputSource
}

export const clipboardInputPlugin = plugin({
	id: CLIPBOARD_INPUT_PLUGIN_ID,
	name: "Rekon Clipboard Input",
	setup: (ctx) => {
		ctx.addGlobalOption("clipboard", {
			type: "boolean",
			default: false,
			description: "Watch system clipboard for URLs and process them serially",
		})
	},
	extension: (ctx): ClipboardInputExtension => {
		const extensions = ctx.extensions as Record<string, unknown>
		const log = extensions[LOG_PLUGIN_ID] as LogExtension
		const values = ctx.values as { clipboard?: boolean }
		return {
			active: !!values.clipboard,
			source: () => clipboardSource(log),
		}
	},
})
