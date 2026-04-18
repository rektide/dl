import { define } from "gunshi"
import { ARCHIVE_ACTION_SPEC } from "../archive/handler.ts"
import { buildSubcommandOptions, processEntries } from "./run.ts"
import type { DlCommandParams } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { prependOrg } from "./prepend-org.ts"

const args = {
	...globalArgs,
	state: {
		type: "enum",
		choices: [...ARCHIVE_ACTION_SPEC.states],
		default: ARCHIVE_ACTION_SPEC.defaultState,
		description: "Archive state (ensure|off)",
	},
} as const

export default define<DlCommandParams>({
	name: "archive",
	description: "Clone or update archive checkout for repositories",
	args,
	async run(ctx) {
		const inputs = prependOrg(ctx.values.org, ctx.positionals)
		if (inputs.length === 0) {
			console.error("usage: rekon dl archive [--state=ensure|off] <repo-url|org/repo> [...]")
			process.exit(1)
		}
		const options = buildSubcommandOptions(
			ctx.extensions,
			ctx.values as Record<string, unknown>,
			ctx.explicit as Record<string, boolean | undefined>,
			ctx.tokens,
			ARCHIVE_ACTION_SPEC,
			ctx.values.state,
		)
		const hadError = await processEntries(ctx.extensions, options, (async function* () { for (const i of inputs) yield i })())
		if (hadError) process.exit(1)
	},
})
