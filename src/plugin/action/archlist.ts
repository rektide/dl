import { plugin } from "gunshi/plugin"
import {
	ARCHLIST_ACTION_FLAG_OPTION,
	ARCHLIST_ACTION_SPEC,
	ARCHLIST_ACTION_STATE_OPTION,
} from "../../dl/archlist.ts"

export const DL_ARCHLIST_ACTION_PLUGIN_ID = "dl:action:archlist" as const

export const dlArchlistActionPlugin = plugin({
	id: DL_ARCHLIST_ACTION_PLUGIN_ID,
	name: "DL Archlist Action",
	setup: (ctx) => {
		ctx.addGlobalOption(ARCHLIST_ACTION_SPEC.name, ARCHLIST_ACTION_FLAG_OPTION)
		ctx.addGlobalOption(`${ARCHLIST_ACTION_SPEC.name}-state`, ARCHLIST_ACTION_STATE_OPTION)
	},
	extension: () => ({
		"dl:actions": [ARCHLIST_ACTION_SPEC],
	}),
})
