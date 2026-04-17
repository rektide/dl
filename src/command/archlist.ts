import { OFF, FORCE, ENSURE, state, type StepState } from "../dl/actions.ts"
import { archlistHandler } from "../dl/archlist.ts"
import { createDlCommand } from "./dl-command.ts"

const VALID_STATES = new Set<string>([FORCE, ENSURE, OFF])

export default createDlCommand({
	name: "archlist",
	description: "Append resolved repository URLs to ~/archlist",
	usage: "usage: rekon dl archlist [--state=force|ensure|off] <repo-url|org/repo> [...]",
	args: {
		state: {
			type: "string",
			default: "force",
			description: "Archlist state (force|ensure|off)",
		},
	},
	buildOptions: (values) => ({
		archlistState: VALID_STATES.has(values.state as string) ? state(values.state as string) : FORCE,
	}),
	handlers: [archlistHandler],
})
