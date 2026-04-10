import type { DlOptions } from "./types.ts"

export const DL_COMMAND_NAME = "dl"

interface ParsedArgs extends DlOptions {
	inputs: string[]
	watch: boolean
	org?: string
}

export function parseArgs(argv: string[]): ParsedArgs {
	const tokens = argv[0] === DL_COMMAND_NAME ? argv.slice(1) : argv
	let org: string | undefined
	const filtered: string[] = []
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i] === "--org") {
			org = tokens[++i]
		} else {
			filtered.push(tokens[i])
		}
	}
	const inputs = filtered.filter((token) => !token.startsWith("-"))
	const consumeDexportOutput =
		tokens.includes("--consume-dexport-output") || tokens.includes("-c")
	const watch = tokens.includes("--watch")
	const noLogCache = tokens.includes("--no-log-cache")
	const reportLifecycle = tokens.includes("--report-lifecycle") && !tokens.includes("--no-report-lifecycle")
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
		org,
		consumeDexportOutput,
		noLogCache,
		reportLifecycle,
		doArchive,
		doWiki,
		doArchlist,
		doSimplify,
		expand,
		dryRun,
	}
}
