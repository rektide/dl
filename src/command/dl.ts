#!/usr/bin/env node
import { realpath } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { define, cli } from "gunshi"
import { c12 } from "gunshi-c12"
import { parseArgs, DL_COMMAND_NAME } from "../dl/args.ts"
import { createProcessEntry } from "../dl/index.ts"
import type { DlOptions } from "../dl/types.ts"
import { watchArchlist } from "../dl/watch.ts"
import {
	createDexportPlugin,
	DEXPORT_PLUGIN_ID,
	type DexportExtension,
} from "../plugin/dexport.ts"
import {
	createGitPlugin,
	GIT_PLUGIN_ID,
	type GitExtension,
} from "../plugin/git.ts"
import {
	createRepoPlugin,
	REPO_PLUGIN_ID,
	type RepoExtension,
} from "../plugin/repo.ts"
import {
	createRootsPlugin,
	ROOTS_PLUGIN_ID,
	type RootsExtension,
} from "../plugin/roots.ts"
import {
	createLogPlugin,
	LOG_PLUGIN_ID,
	type LogExtension,
} from "../plugin/log.ts"

interface DlCommandContext {
	extensions?: {
		[ROOTS_PLUGIN_ID]?: RootsExtension
		[REPO_PLUGIN_ID]?: RepoExtension
		[GIT_PLUGIN_ID]?: GitExtension
		[DEXPORT_PLUGIN_ID]?: DexportExtension
		[LOG_PLUGIN_ID]?: LogExtension
	}
}

	async function run(ctx?: DlCommandContext) {
	const logExtension = ctx?.extensions?.[LOG_PLUGIN_ID]
	try {
		const {
			inputs,
			watch,
			consumeDexportOutput,
			noLogCache,
			doArchive,
			doWiki,
			doArchlist,
			expand,
			dryRun,
		} = parseArgs(process.argv.slice(2))

		if (inputs.length === 0 && !watch) {
			console.error(
				"usage: rekon dl [--watch] <repo-url|org/repo> [repo-url|org/repo ...]",
			)
			process.exit(1)
		}

		if (!logExtension) {
			throw new Error("dl: log plugin extension is not available")
		}

		const rootsExtension = ctx?.extensions?.[ROOTS_PLUGIN_ID]
		const repoExtension = ctx?.extensions?.[REPO_PLUGIN_ID]
		const gitExtension = ctx?.extensions?.[GIT_PLUGIN_ID]
		const dexportExtension = ctx?.extensions?.[DEXPORT_PLUGIN_ID]
		if (!rootsExtension) {
			throw new Error("dl: roots plugin extension is not available")
		}
		if (!repoExtension) {
			throw new Error("dl: repo plugin extension is not available")
		}
		if (!gitExtension) {
			throw new Error("dl: git plugin extension is not available")
		}
		if (!dexportExtension) {
			throw new Error("dl: dexport plugin extension is not available")
		}
		const roots = await rootsExtension.resolveRoots()
		const options: DlOptions = {
			consumeDexportOutput,
			noLogCache,
			doArchive,
			doWiki,
			doArchlist,
			expand,
			dryRun,
		}

		if (watch && options.doArchlist) {
			logExtension.warn("sync", "archlist_disabled", { reason: "watch mode feedback loop" })
			options.doArchlist = false
		}

		if (expand) {
			for (const input of inputs) {
				let found = false
				for await (const resolved of repoExtension.resolve(input)) {
					found = true
					logExtension.info("expand", "resolved", {
						input,
						url: resolved.url?.toString(),
						pathname: resolved.url?.pathname,
						wikiGitUrl: resolved.wikiGitUrl?.toString(),
						source: resolved.source,
					})
				}
				if (!found) {
					logExtension.warn("expand", "no_match", { input })
				}
			}
			return
		}

		let hadError = false
		const processEntry = createProcessEntry(
			repoExtension,
			roots,
			options,
			logExtension,
			gitExtension,
			dexportExtension,
		)

		for (const input of inputs) {
			hadError = (await processEntry(input)) || hadError
		}

		if (watch) {
			hadError = (await watchArchlist(processEntry, logExtension)) || hadError
		}

		if (hadError) {
			process.exit(1)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (logExtension) {
			logExtension.error("sync", "failed", { message })
		} else {
			console.error(`sync failed: ${message}`)
		}
		process.exit(1)
	}
}

export default define({
	name: DL_COMMAND_NAME,
	description: "Fetch repository checkout and wiki checkout",
	args: {
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
		archive: {
			type: "boolean",
			default: false,
			description: "Only update archive (disables wiki unless --wiki also set)",
		},
		wiki: {
			type: "boolean",
			default: false,
			description: "Only update wiki (disables archive unless --archive also set)",
		},
		archlist: {
			type: "boolean",
			default: false,
			description: "Append resolved repository URLs to ~/archlist",
		},
		watch: {
			type: "boolean",
			default: false,
			description: "Watch ~/archlist and process appended entries serially",
		},
		expand: {
			type: "boolean",
			default: false,
			description: "Output resolved repo info without syncing",
		},
		"dry-run": {
			type: "boolean",
			default: false,
			description: "Show what would be done without making changes",
		},
	},
	run,
})

void (async () => {
	const mainPath = await realpath(process.argv[1])
	const mainUrl = pathToFileURL(mainPath).href
	if (import.meta.url === mainUrl) {
		const module = await import("./dl.ts")
		await cli(process.argv.slice(2), module.default, {
			name: DL_COMMAND_NAME,
			plugins: [
				c12({ name: "rekon" }),
				createLogPlugin(),
				createRootsPlugin(),
				createRepoPlugin(),
				createGitPlugin(),
				createDexportPlugin(),
			],
		})
	}
})()
