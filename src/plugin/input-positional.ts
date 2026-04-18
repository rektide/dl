import { plugin } from "gunshi/plugin"
import type { InputSource } from "../command/input.ts"
import { positionalSource } from "../command/input.ts"

export const POSITIONAL_INPUT_PLUGIN_ID = "rekon:input:positional" as const

export interface PositionalInputExtension {
	source: (org: string | undefined, positionals: readonly string[]) => InputSource
}

export const positionalInputPlugin = plugin({
	id: POSITIONAL_INPUT_PLUGIN_ID,
	name: "Rekon Positional Input",
	setup: (ctx) => {
		ctx.addGlobalOption("org", {
			type: "string",
			description: "Default org prefix; positional args are treated as repo names and org is prepended",
		})
	},
	extension: (): PositionalInputExtension => ({
		source: (org, positionals) => positionalSource(org, positionals),
	}),
})
