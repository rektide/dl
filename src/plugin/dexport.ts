import { plugin } from "gunshi/plugin"
import { defaultDexportOps } from "../dexport/default.ts"
import type { DexportOps } from "../dexport/types.ts"

export const DEXPORT_PLUGIN_ID = "rekon:dexport" as const

export interface DexportExtension extends DexportOps {}

export const dexportPlugin = plugin({
	id: DEXPORT_PLUGIN_ID,
	name: "Rekon Dexport",
	setup: (ctx) => {
		ctx.addGlobalOption("consume-dexport-output", {
			type: "boolean",
			short: "c",
			default: false,
			description: "Run dexport detached and suppress its output",
		})
	},
	extension: (): DexportExtension => defaultDexportOps,
})
