import { plugin } from "gunshi/plugin"
import { ARCHIVE_ACTION_SPEC } from "../dl/archive-action.ts"
import type { DlActionSpec, DlActionToken } from "../dl/action-registry.ts"
import {
	actionStatesToOptions,
	buildActionArgs,
	collectActionSpecsFromExtensions,
	dedupeActionSpecs,
	registerActionGlobalOptions,
	resolveActionOptions,
	resolveActionStates,
} from "../dl/action-registry.ts"
import { ARCHLIST_ACTION_SPEC } from "../dl/archlist.ts"
import { SYMLINK_ACTION_SPEC } from "../dl/symlink.ts"
import { WIKI_ACTION_SPEC } from "../dl/wiki-action.ts"

export const DL_ACTIONS_PLUGIN_ID = "dl:actions" as const

const BUILTIN_ACTION_SPECS: ReadonlyArray<DlActionSpec> = [
	ARCHIVE_ACTION_SPEC,
	WIKI_ACTION_SPEC,
	ARCHLIST_ACTION_SPEC,
	SYMLINK_ACTION_SPEC,
]

export interface DlActionsExtension {
	"dl:actions": ReadonlyArray<DlActionSpec>
	actionArgs: ReturnType<typeof buildActionArgs>
	resolveActionStates: (
		values: Record<string, unknown>,
		explicit: Record<string, boolean | undefined>,
		tokens?: ReadonlyArray<DlActionToken>,
	) => Record<string, string>
	resolveActionOptions: (
		values: Record<string, unknown>,
		explicit: Record<string, boolean | undefined>,
		tokens?: ReadonlyArray<DlActionToken>,
	) => Record<string, string>
	actionStatesToOptions: (states: Record<string, string>) => Record<string, string>
}

export function createDlActionsPlugin() {
	return plugin({
		id: DL_ACTIONS_PLUGIN_ID,
		name: "DL Actions",
		setup: (ctx) => {
			registerActionGlobalOptions(ctx, BUILTIN_ACTION_SPECS)
		},
		extension: (ctx): DlActionsExtension => {
			const discovered = collectActionSpecsFromExtensions(
				ctx.extensions as Record<string, unknown>,
			)
			const specs = dedupeActionSpecs([...BUILTIN_ACTION_SPECS, ...discovered])

			return {
				"dl:actions": specs,
				actionArgs: buildActionArgs(specs),
				resolveActionStates: (values, explicit, tokens = []) =>
					resolveActionStates(specs, values, explicit, tokens),
				resolveActionOptions: (values, explicit, tokens = []) =>
					resolveActionOptions(specs, values, explicit, tokens),
				actionStatesToOptions: (states) => actionStatesToOptions(specs, states),
			}
		},
	})
}
