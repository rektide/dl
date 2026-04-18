import { define } from "gunshi"
import { resolveActionState } from "../action/registry.ts"
import { DEEPWIKI_ACTION_SPEC } from "../deepwiki/handler.ts"
import { buildBaseOptions, runEntries } from "./util.ts"
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
		const inputs = prependOrg(undefined, ctx.positionals)
		if (inputs.length === 0) {
			console.error("usage: rekon dl deepwiki [--state=ensure|off] <repo-url|org/repo> [...]")
			process.exit(1)
		}
		const options = {
			...buildBaseOptions(ctx.values as Record<string, unknown>),
			deepwikiState: resolveActionState(DEEPWIKI_ACTION_SPEC, ctx.values.state ?? DEEPWIKI_ACTION_SPEC.defaultState),
		}
		const hadError = await runEntries(ctx.extensions, options, inputs)
		if (hadError) process.exit(1)
	},
})
