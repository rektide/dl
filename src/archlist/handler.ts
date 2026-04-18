import { FORCE, OFF, ENSURE } from "../action/state.ts"
import type { DlActionSpec } from "../action/registry.ts"
import type { LifecycleReporter } from "../action/lifecycle.ts"
import type { ActionHandler, ActionResult } from "../action/handler.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "../action/types.ts"
import { syncArchlist } from "./sync.ts"

const ARCHLIST_STATES = [FORCE, ENSURE, OFF] as const

export const ARCHLIST_ACTION_SPEC: DlActionSpec = {
	name: "archlist",
	description: "Archlist update action",
	defaultState: FORCE,
	states: ARCHLIST_STATES,
	optionKey: "archlistState",
}

export const ARCHLIST_ACTION_FLAG_OPTION = {
	type: "boolean",
	default: false,
	description: "Archlist update action (bare --archlist uses default state 'force')",
} as const

export const ARCHLIST_ACTION_STATE_OPTION = {
	type: "enum",
	choices: ARCHLIST_STATES,
	description: "Archlist update action state (force|ensure|off)",
} as const

export const archlistHandler: ActionHandler = {
	id: "archlist",
	run: async (resolved: RepoContext, ctx: DlContext, lifecycle: LifecycleReporter): Promise<ActionResult> => {
		return syncArchlist(
			resolved.url!.toString(),
			ctx.options.archlistState,
			lifecycle,
			ctx.log,
		)
	},
}
