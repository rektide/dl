import { ENSURE, OFF } from "./actions.ts"
import type { DlActionSpec } from "./action-registry.ts"

const WIKI_STATES = [ENSURE, OFF] as const

export const WIKI_ACTION_SPEC: DlActionSpec = {
	name: "wiki",
	description: "Wiki checkout action",
	defaultState: ENSURE,
	states: WIKI_STATES,
	optionKey: "wikiState",
}

export const WIKI_ACTION_FLAG_OPTION = {
	type: "boolean",
	default: false,
	description: "Wiki checkout action (bare --wiki uses default state 'ensure')",
} as const

export const WIKI_ACTION_STATE_OPTION = {
	type: "enum",
	choices: WIKI_STATES,
	description: "Wiki checkout action state (ensure|off)",
} as const
