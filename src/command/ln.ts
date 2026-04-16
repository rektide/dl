#!/usr/bin/env node
import { readdir, realpath } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { define, cli } from "gunshi"
import { simplify, ensureSymlink } from "../simplify/index.ts"
import type { SimplifyLog } from "../simplify/index.ts"

const stdLog: SimplifyLog = {
	info: (_stage, event, data) => console.log(`${event}: ${JSON.stringify(data)}`),
	warn: (_stage, event, data) => console.warn(`${event}: ${JSON.stringify(data)}`),
}

async function simplifyOrg(archiveRoot: string, org: string, dryRun: boolean): Promise<void> {
	const simplifiedOrg = simplify(org)
	if (simplifiedOrg !== org) {
		await ensureSymlink(archiveRoot, org, simplifiedOrg, dryRun, stdLog)
	}

	const orgDir = join(archiveRoot, org)
	const entries = await readdir(orgDir, { withFileTypes: true })
	for (const entry of entries) {
		if (!entry.isDirectory()) continue
		const simplifiedRepo = simplify(entry.name)
		if (simplifiedRepo !== entry.name) {
			await ensureSymlink(orgDir, entry.name, simplifiedRepo, dryRun, stdLog)
		}
	}
}

async function simplifyPath(
	archiveRoot: string,
	targetPath: string,
	dryRun: boolean,
): Promise<void> {
	const resolved = await realpath(targetPath)
	const relative = resolved.startsWith(archiveRoot + "/")
		? resolved.slice(archiveRoot.length + 1)
		: null

	if (!relative) {
		console.error(`skipping ${targetPath}: not under ${archiveRoot}`)
		return
	}

	const parts = relative.split("/")

	if (parts.length === 1) {
		await simplifyOrg(archiveRoot, parts[0], dryRun)
		return
	}

	const org = parts[0]
	const repo = parts[1]
	await ensureSymlink(archiveRoot, org, simplify(org), dryRun, stdLog)
	await ensureSymlink(join(archiveRoot, org), repo, simplify(repo), dryRun, stdLog)
}

export default define({
	name: "ln",
	description: "Create simplified symlinks for archive org/repo paths",
	args: {
		"dry-run": {
			type: "boolean",
			short: "n",
			default: false,
			description: "Show what would be done without making changes",
		},
	},
	run: async (ctx) => {
		const dryRun = ctx.values["dry-run"] ?? false
		const archiveRoot = join(homedir(), "archive")
		const inputs: string[] = ctx.positionals

		if (inputs.length === 0) {
			await simplifyPath(archiveRoot, process.cwd(), dryRun)
			return
		}

		for (const input of inputs) {
			await simplifyPath(archiveRoot, input, dryRun)
		}
	},
})

void (async () => {
	const mainPath = await realpath(process.argv[1])
	const mainUrl = pathToFileURL(mainPath).href
	if (import.meta.url === mainUrl) {
		const module = await import("./ln.ts")
		await cli(process.argv.slice(2), module.default, { name: "ln" })
	}
})()
