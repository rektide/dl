import { define } from "gunshi"
import { WIKI_ACTION_SPEC } from "../wiki/handler.ts"
import { buildSubcommandOptions, processEntries } from "./run.ts"
import { positionalSource } from "./input.ts"
import type { DlCommandParams } from "./context.ts"
import { globalArgs } from "../arg/global.ts"

const args = {
	...globalArgs,
	state: {
		type: "enum",
		choices: [...WIKI_ACTION_SPEC.states],
		default: WIKI_ACTION_SPEC.defaultState,
		description: "Wiki state (ensure|off)",
	},
} as const

export default define<DlCommandParams>({
	name: "wiki",
	description: "Clone or update git wiki checkout for repositories",
	args,
	async run(ctx) {
		const inputs = positionalSource(ctx.values.org, ctx.positionals)
		const options = buildSubcommandOptions(
			ctx.extensions,
			ctx.values as Record<string, unknown>,
			ctx.explicit as Record<string, boolean | undefined>,
			ctx.tokens,
			WIKI_ACTION_SPEC,
			ctx.values.state,
		)
		const hadError = await processEntries(ctx.extensions, options, inputs)
		if (hadError) process.exit(1)
	},
})
