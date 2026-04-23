import { defineWithTypes } from "gunshi"
import { ARCHIVE_ACTION_SPEC } from "../archive/handler.ts"
import { runLegacyActionsFromFlow } from "../legacy/run.ts"
import { buildSubcommandOptions } from "./run.ts"
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts"
import type { DlCommandParams } from "./context.ts"

export default defineWithTypes<DlCommandParams>()({
	name: "archive",
	description: "Clone or update archive checkout for repositories",
	args: {
		state: {
			type: "enum",
			choices: [...ARCHIVE_ACTION_SPEC.states],
			default: ARCHIVE_ACTION_SPEC.defaultState,
			description: "Archive state (ensure|off)",
		},
	},
	async run(ctx) {
		const positional = ctx.extensions[POSITIONAL_INPUT_PLUGIN_ID]
		const inputs = positional.source(ctx.values.org as string | undefined, ctx.positionals) // gunshi: plugin-registered global
		const options = buildSubcommandOptions(
			ctx.extensions,
			ctx.values,
			ctx.explicit,
			ctx.tokens,
			ARCHIVE_ACTION_SPEC,
			ctx.values.state,
		)
		const hadError = await runLegacyActionsFromFlow(ctx.extensions, options, inputs)
		if (hadError) process.exit(1)
	},
})
