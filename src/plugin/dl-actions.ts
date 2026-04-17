import { plugin } from "gunshi/plugin"
import type { DlActionSpec, DlActionToken } from "../dl/action-registry.ts"
import {
	collectActionSpecsFromExtensions,
	resolveActionOptions,
	resolveActionStates,
} from "../dl/action-registry.ts"

export const DL_ACTIONS_PLUGIN_ID = "dl:actions" as const

export interface DlActionsExtension {
	"dl:actions": ReadonlyArray<DlActionSpec>
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
}

export const dlActionsPlugin = plugin({
	id: DL_ACTIONS_PLUGIN_ID,
	name: "DL Actions",
	extension: (ctx): DlActionsExtension => {
		const discovered = collectActionSpecsFromExtensions(
			ctx.extensions as Record<string, unknown>,
		)
		const specs = discovered
		if (specs.length === 0) {
			throw new Error("dl: no action providers registered")
		}

		return {
			"dl:actions": specs,
			resolveActionStates: (values, explicit, tokens = []) =>
				resolveActionStates(specs, values, explicit, tokens),
			resolveActionOptions: (values, explicit, tokens = []) =>
				resolveActionOptions(specs, values, explicit, tokens),
		}
	},
})
