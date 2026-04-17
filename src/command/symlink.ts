import { OFF, ENSURE, state } from "../dl/actions.ts"
import { symlinkHandler } from "../dl/symlink.ts"
import { createDlCommand } from "./dl-command.ts"

const VALID_STATES = new Set<string>([ENSURE, OFF])

export default createDlCommand({
	name: "symlink",
	description: "Create simplified symlinks for org/repo names",
	usage: "usage: rekon dl symlink [--state=ensure|off] [--anycase] <repo-url|org/repo> [...]",
	args: {
		state: {
			type: "string",
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
		doSymlink: true,
		symlinkState: VALID_STATES.has(values.state as string) ? state(values.state as string) : ENSURE,
		anycase: !!values.anycase,
	}),
	handlers: [symlinkHandler],
})
