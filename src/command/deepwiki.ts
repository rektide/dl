import { define } from "gunshi"
import { DEEPWIKI_ACTION_SPEC } from "../deepwiki/handler.ts"
import { buildSubcommandOptions, processEntries } from "./run.ts"
import type { DlCommandParams } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { prependOrg } from "./prepend-org.ts"

const args = {
	...globalArgs,
	state: {
		type: "enum",
		choices: [...DEEPWIKI_ACTION_SPEC.states],
		default: DEEPWIKI_ACTION_SPEC.defaultState,
		description: "Deepwiki state (ensure|off)",
	},
} as const

export default define<DlCommandParams>({
	name: "deepwiki",
	description: "Sync deepwiki (dexport) content for repositories",
	args,
	async run(ctx) {
		const inputs = prependOrg(ctx.values.org, ctx.positionals)
		if (inputs.length === 0) {
			console.error("usage: rekon dl deepwiki [--state=ensure|off] <repo-url|org/repo> [...]")
			process.exit(1)
		}
		const options = buildSubcommandOptions(
			ctx.extensions,
			ctx.values as Record<string, unknown>,
			ctx.explicit as Record<string, boolean | undefined>,
			ctx.tokens,
			DEEPWIKI_ACTION_SPEC,
			ctx.values.state,
		)
		const hadError = await processEntries(ctx.extensions, options, (async function* () { for (const i of inputs) yield i })())
		if (hadError) process.exit(1)
	},
})
