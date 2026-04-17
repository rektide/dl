import { ENSURE, OFF } from "./actions.ts"
import type { DlActionSpec } from "./action-registry.ts"

export const WIKI_ACTION_SPEC: DlActionSpec = {
	name: "wiki",
	description: "Wiki checkout action",
	defaultState: ENSURE,
	states: [ENSURE, OFF],
	optionKey: "wikiState",
}
