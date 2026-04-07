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
	const hasSimplifyFlag = tokens.includes("--simplify")
	const expand = tokens.includes("--expand")
	const dryRun = tokens.includes("--dry-run")

	let doArchive = true
	let doWiki = true
	let doArchlist = true
	let doSimplify = true

	if (hasArchiveFlag || hasWikiFlag || hasArchlistFlag || hasSimplifyFlag) {
		doArchive = hasArchiveFlag
		doWiki = hasWikiFlag
		doArchlist = hasArchlistFlag
		doSimplify = hasSimplifyFlag
	}

	return {
		inputs,
		watch,
		consumeDexportOutput,
		noLogCache,
		doArchive,
		doWiki,
		doArchlist,
		doSimplify,
		expand,
		dryRun,
	}
}
