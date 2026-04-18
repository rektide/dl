import { define } from "gunshi"
import { ARCHLIST_ACTION_SPEC } from "../archlist/handler.ts"
import { buildSubcommandOptions, processEntries } from "./run.ts"
import { POSITIONAL_INPUT_PLUGIN_ID, type PositionalInputExtension } from "../plugin/input-positional.ts"
import type { DlCommandParams } from "./context.ts"

export default define<DlCommandParams>({
	name: "archlist",
	description: "Append resolved repository URLs to ~/archlist",
	args: {
		state: {
			type: "enum",
			choices: [...ARCHLIST_ACTION_SPEC.states],
			default: ARCHLIST_ACTION_SPEC.defaultState,
			description: "Archlist state (force|ensure|off)",
		},
	},
	async run(ctx) {
		const positional = ctx.extensions[POSITIONAL_INPUT_PLUGIN_ID] as PositionalInputExtension
		const inputs = positional.source(ctx.values.org as string | undefined, ctx.positionals)
		const options = buildSubcommandOptions(
			ctx.extensions,
			ctx.values as Record<string, unknown>,
			ctx.explicit as Record<string, boolean | undefined>,
			ctx.tokens,
			ARCHLIST_ACTION_SPEC,
			ctx.values.state,
		)
		const hadError = await processEntries(ctx.extensions, options, inputs)
		if (hadError) process.exit(1)
	},
})
