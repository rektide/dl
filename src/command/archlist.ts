import { define } from "gunshi"
import { ARCHLIST_ACTION_SPEC } from "../archlist/handler.ts"
import { buildSubcommandOptions, processEntries } from "./run.ts"
import type { DlCommandParams } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { prependOrg } from "./prepend-org.ts"

const args = {
	...globalArgs,
	state: {
		type: "enum",
		choices: [...ARCHLIST_ACTION_SPEC.states],
		default: ARCHLIST_ACTION_SPEC.defaultState,
		description: "Archlist state (force|ensure|off)",
	},
} as const

export default define<DlCommandParams>({
	name: "archlist",
	description: "Append resolved repository URLs to ~/archlist",
	args,
	async run(ctx) {
		const inputs = prependOrg(ctx.values.org, ctx.positionals)
		if (inputs.length === 0) {
			console.error("usage: rekon dl archlist [--state=force|ensure|off] <repo-url|org/repo> [...]")
			process.exit(1)
		}
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
