import { ENSURE, OFF } from "./actions.ts"
import type { DlActionSpec } from "./action-registry.ts"

const ARCHIVE_STATES = [ENSURE, OFF] as const

export const ARCHIVE_ACTION_SPEC: DlActionSpec = {
	name: "archive",
	description: "Archive checkout action",
	defaultState: ENSURE,
	states: ARCHIVE_STATES,
	optionKey: "archiveState",
}

export const ARCHIVE_ACTION_FLAG_OPTION = {
	type: "boolean",
	default: false,
	description: "Archive checkout action (bare --archive uses default state 'ensure')",
} as const

export const ARCHIVE_ACTION_STATE_OPTION = {
	type: "enum",
	choices: ARCHIVE_STATES,
	description: "Archive checkout action state (ensure|off)",
} as const
