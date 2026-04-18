import { plugin } from "gunshi/plugin"
import {
	ARCHIVE_ACTION_FLAG_OPTION,
	ARCHIVE_ACTION_SPEC,
	ARCHIVE_ACTION_STATE_OPTION,
	archiveHandler,
} from "./handler.ts"

export const DL_ARCHIVE_ACTION_PLUGIN_ID = "dl:action:archive" as const

export const dlArchiveActionPlugin = plugin({
	id: DL_ARCHIVE_ACTION_PLUGIN_ID,
	name: "DL Archive Action",
	setup: (ctx) => {
		ctx.addGlobalOption(ARCHIVE_ACTION_SPEC.name, ARCHIVE_ACTION_FLAG_OPTION)
		ctx.addGlobalOption(`${ARCHIVE_ACTION_SPEC.name}-state`, ARCHIVE_ACTION_STATE_OPTION)
	},
	extension: () => ({
		"dl:actions": [ARCHIVE_ACTION_SPEC],
		"dl:handlers": [archiveHandler],
	}),
})
