import { ENSURE, FORCE, OFF } from "../dl/actions.ts"
import { resolveActionState } from "../dl/action-registry.ts"
import { ARCHLIST_ACTION_SPEC } from "../dl/archlist.ts"
import { createDlCommand } from "./dl-command.ts"

export default createDlCommand({
	name: "archlist",
	description: "Append resolved repository URLs to ~/archlist",
	usage: "usage: rekon dl archlist [--state=force|ensure|off] <repo-url|org/repo> [...]",
	args: {
		state: {
			type: "enum",
			choices: [FORCE, ENSURE, OFF],
			default: "force",
			description: "Archlist state (force|ensure|off)",
		},
	},
	buildOptions: (values) => ({
		archlistState: resolveActionState(ARCHLIST_ACTION_SPEC, values.state ?? FORCE),
	}),
})
