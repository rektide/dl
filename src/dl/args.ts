import type { DlOptions } from "./types.ts"

export const DL_COMMAND_NAME = "dl"

interface ParsedArgs extends DlOptions {
	inputs: string[]
	watch: boolean
}

export function parseArgs(argv: string[]): ParsedArgs {
	const tokens = argv[0] === DL_COMMAND_NAME ? argv.slice(1) : argv
	const inputs = tokens.filter((token) => !token.startsWith("-"))
	const consumeDexportOutput =
		tokens.includes("--consume-dexport-output") || tokens.includes("-c")
	const watch = tokens.includes("--watch")
	const noLogCache = tokens.includes("--no-log-cache")
	const hasArchiveFlag = tokens.includes("--archive")
	const hasWikiFlag = tokens.includes("--wiki")
	const hasArchlistFlag = tokens.includes("--archlist")
	const expand = tokens.includes("--expand")
	const dryRun = tokens.includes("--dry-run")

	let doArchive = true
	let doWiki = true
	let doArchlist = true

	if (hasArchiveFlag || hasWikiFlag || hasArchlistFlag) {
		doArchive = hasArchiveFlag
		doWiki = hasWikiFlag
		doArchlist = hasArchlistFlag
	}

	return {
		inputs,
		watch,
		consumeDexportOutput,
		noLogCache,
		doArchive,
		doWiki,
		doArchlist,
		expand,
		dryRun,
	}
}
