import { define } from "gunshi"
import { resolveActionState } from "../dl/action-registry.ts"
import { ARCHLIST_ACTION_SPEC } from "../dl/archlist.ts"
import { buildBaseOptions, runEntries } from "../util/command.ts"
import type { DlExtensions } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { prependOrg } from "../util/prepend-org.ts"

const args = {
	...globalArgs,
	state: {
		type: "enum",
		choices: [...ARCHLIST_ACTION_SPEC.states],
		default: ARCHLIST_ACTION_SPEC.defaultState,
		description: "Archlist state (force|ensure|off)",
	},
} as const

export default define({
	name: "archlist",
	description: "Append resolved repository URLs to ~/archlist",
	args,
	async run(ctx) {
		const inputs = prependOrg(undefined, ctx.positionals)
		if (inputs.length === 0) {
			console.error("usage: rekon dl archlist [--state=force|ensure|off] <repo-url|org/repo> [...]")
			process.exit(1)
		}
		const options = {
			...buildBaseOptions(ctx.values as Record<string, unknown>),
			archlistState: resolveActionState(ARCHLIST_ACTION_SPEC, ctx.values.state ?? ARCHLIST_ACTION_SPEC.defaultState),
		}
		const hadError = await runEntries(ctx.extensions as DlExtensions, options, inputs)
		if (hadError) process.exit(1)
	},
})
