import { define } from "gunshi"
import { SYMLINK_ACTION_SPEC } from "../symlink/handler.ts"
import { buildSubcommandOptions, processEntries } from "./run.ts"
import { POSITIONAL_INPUT_PLUGIN_ID, type PositionalInputExtension } from "../plugin/input-positional.ts"
import type { DlCommandParams } from "./context.ts"

export default define<DlCommandParams>({
	name: "symlink",
	description: "Create simplified symlinks for org/repo names",
	args: {
		state: {
			type: "enum",
			choices: [...SYMLINK_ACTION_SPEC.states],
			default: SYMLINK_ACTION_SPEC.defaultState,
			description: "Symlink state (ensure|off)",
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
			SYMLINK_ACTION_SPEC,
			ctx.values.state,
		)
		options.anycase = !!ctx.values.anycase
		const hadError = await processEntries(ctx.extensions, options, inputs)
		if (hadError) process.exit(1)
	},
})
