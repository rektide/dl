import { plugin } from "gunshi/plugin"
import type { DlActionSpec, DlActionToken } from "../action/registry.ts"
import type { ActionHandler } from "../action/handler.ts"
import {
	collectActionSpecsFromExtensions,
	collectActionHandlersFromExtensions,
	resolveActionOptions,
	resolveActionStates,
} from "../action/registry.ts"

export const DL_ACTIONS_PLUGIN_ID = "dl:actions" as const

export interface DlActionsExtension {
	"dl:actions": ReadonlyArray<DlActionSpec>
	"dl:handlers": ReadonlyArray<ActionHandler>
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
		const specs = collectActionSpecsFromExtensions(
			ctx.extensions as Record<string, unknown>,
		)
		const handlers = collectActionHandlersFromExtensions(
			ctx.extensions as Record<string, unknown>,
		)
		if (specs.length === 0) {
			throw new Error("dl: no action providers registered")
		}

		return {
			"dl:actions": specs,
			"dl:handlers": handlers,
			resolveActionStates: (values, explicit, tokens = []) =>
				resolveActionStates(specs, values, explicit, tokens),
			resolveActionOptions: (values, explicit, tokens = []) =>
				resolveActionOptions(specs, values, explicit, tokens),
		}
	},
})
