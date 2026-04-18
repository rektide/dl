import { define } from "gunshi"
import { resolveActionState } from "../action/registry.ts"
import { SYMLINK_ACTION_SPEC } from "../symlink/handler.ts"
import { buildBaseOptions, runEntries } from "./util.ts"
import type { DlCommandParams } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { prependOrg } from "./prepend-org.ts"

const args = {
	...globalArgs,
	state: {
		type: "enum",
		choices: [...SYMLINK_ACTION_SPEC.states],
		default: SYMLINK_ACTION_SPEC.defaultState,
		description: "Symlink state (ensure|off)",
	},
	anycase: {
		type: "boolean",
		default: false,
		description: "Also create symlinks for pure case differences (e.g. Rust→rust)",
	},
} as const

export default define<DlCommandParams>({
	name: "symlink",
	description: "Create simplified symlinks for org/repo names",
	args,
	async run(ctx) {
		const inputs = prependOrg(undefined, ctx.positionals)
		if (inputs.length === 0) {
			console.error("usage: rekon dl symlink [--state=ensure|off] [--anycase] <repo-url|org/repo> [...]")
			process.exit(1)
		}
		const options = {
			...buildBaseOptions(ctx.values as Record<string, unknown>),
			symlinkState: resolveActionState(SYMLINK_ACTION_SPEC, ctx.values.state ?? SYMLINK_ACTION_SPEC.defaultState),
			anycase: !!ctx.values.anycase,
		}
		const hadError = await runEntries(ctx.extensions, options, inputs)
		if (hadError) process.exit(1)
	},
})
