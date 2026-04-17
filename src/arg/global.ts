export const globalArgs = {
	"consume-dexport-output": {
		type: "boolean",
		short: "c",
		default: false,
		description: "Run dexport detached and suppress its output",
	},
	"no-log-cache": {
		type: "boolean",
		default: false,
		description: "Disable logging of cached file names",
	},
	"report-lifecycle": {
		type: "boolean",
		default: false,
		description: "Emit structured lifecycle summary per resolved repository",
	},
	"dry-run": {
		type: "boolean",
		default: false,
		description: "Show what would be done without making changes",
	},
} as const
