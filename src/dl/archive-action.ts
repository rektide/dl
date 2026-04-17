import { ENSURE, OFF } from "./actions.ts"
import type { DlActionSpec } from "./action-registry.ts"

export const ARCHIVE_ACTION_SPEC: DlActionSpec = {
	name: "archive",
	description: "Archive checkout action",
	defaultState: ENSURE,
	states: [ENSURE, OFF],
	optionKey: "archiveState",
}
