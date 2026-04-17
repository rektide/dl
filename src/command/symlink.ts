import { ENSURE, OFF } from "../dl/actions.ts"
import { resolveActionState } from "../dl/action-registry.ts"
import { SYMLINK_ACTION_SPEC } from "../dl/symlink.ts"
import { createDlCommand } from "./dl-command.ts"

export default createDlCommand({
	name: "symlink",
	description: "Create simplified symlinks for org/repo names",
	usage: "usage: rekon dl symlink [--state=ensure|off] [--anycase] <repo-url|org/repo> [...]",
	args: {
		state: {
			type: "enum",
			choices: [ENSURE, OFF],
			default: "ensure",
			description: "Symlink state (ensure|off)",
		},
		anycase: {
			type: "boolean",
			default: false,
			description: "Also create symlinks for pure case differences (e.g. Rust→rust)",
		},
	},
	buildOptions: (values) => ({
		symlinkState: resolveActionState(SYMLINK_ACTION_SPEC, values.state ?? ENSURE),
		anycase: !!values.anycase,
	}),
})
