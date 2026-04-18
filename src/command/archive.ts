import { define } from "gunshi"
import { resolveActionState } from "../action/registry.ts"
import { ARCHIVE_ACTION_SPEC } from "../archive/handler.ts"
import { buildBaseOptions, runEntries } from "../util/command.ts"
import type { DlCommandParams } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { prependOrg } from "../util/prepend-org.ts"

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
		const inputs = prependOrg(undefined, ctx.positionals)
		if (inputs.length === 0) {
			console.error("usage: rekon dl archive [--state=ensure|off] <repo-url|org/repo> [...]")
			process.exit(1)
		}
		const options = {
			...buildBaseOptions(ctx.values as Record<string, unknown>),
			archiveState: resolveActionState(ARCHIVE_ACTION_SPEC, ctx.values.state ?? ARCHIVE_ACTION_SPEC.defaultState),
		}
		const hadError = await runEntries(ctx.extensions, options, inputs)
		if (hadError) process.exit(1)
	},
})
