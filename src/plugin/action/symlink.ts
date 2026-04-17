import { plugin } from "gunshi/plugin"
import {
	SYMLINK_ACTION_FLAG_OPTION,
	SYMLINK_ACTION_SPEC,
	SYMLINK_ACTION_STATE_OPTION,
} from "../../dl/symlink.ts"

export const DL_SYMLINK_ACTION_PLUGIN_ID = "dl:action:symlink" as const

export const dlSymlinkActionPlugin = plugin({
	id: DL_SYMLINK_ACTION_PLUGIN_ID,
	name: "DL Symlink Action",
	setup: (ctx) => {
		ctx.addGlobalOption(SYMLINK_ACTION_SPEC.name, SYMLINK_ACTION_FLAG_OPTION)
		ctx.addGlobalOption(`${SYMLINK_ACTION_SPEC.name}-state`, SYMLINK_ACTION_STATE_OPTION)
	},
	extension: () => ({
		"dl:actions": [SYMLINK_ACTION_SPEC],
	}),
})
