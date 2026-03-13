#!/usr/bin/env node
import { realpath } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { define, cli } from "gunshi"
import { c12 } from "gunshi-c12"
import { parseArgs, DL_COMMAND_NAME } from "../dl/args.ts"
import { createProcessEntry } from "../dl/index.ts"
import type { ProcessInputOptions } from "../dl/types.ts"
import { watchArchlist } from "../dl/watch.ts"
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
	type LinkContext,
} from "../repo/link.ts"

interface DlCommandContext extends LinkContext {
	extensions?: LinkContext["extensions"] & {
		[ROOTS_PLUGIN_ID]?: RootsExtension
		[REPO_PLUGIN_ID]?: RepoExtension
		[GIT_PLUGIN_ID]?: GitExtension
	}
}

async function run(ctx?: DlCommandContext) {
	try {
		const {
			inputs,
			watch,
			consumeDexportOutput,
			noLogCache,
			doArchive,
			doWiki,
			doArchlist,
		} = parseArgs(process.argv.slice(2))

		if (inputs.length === 0 && !watch) {
			console.error(
				"usage: rekon dl [--watch] <repo-url|org/repo> [repo-url|org/repo ...]",
			)
			process.exit(1)
		}

		const rootsExtension = ctx?.extensions?.[ROOTS_PLUGIN_ID]
		const repoExtension = ctx?.extensions?.[REPO_PLUGIN_ID]
		const gitExtension = ctx?.extensions?.[GIT_PLUGIN_ID]
		if (!rootsExtension) {
			throw new Error("dl: roots plugin extension is not available")
		}
		if (!repoExtension) {
			throw new Error("dl: repo plugin extension is not available")
		}
		if (!gitExtension) {
			throw new Error("dl: git plugin extension is not available")
		}
		const roots = await rootsExtension.resolveRoots()
		const options: ProcessInputOptions = {
			consumeDexportOutput,
			noLogCache,
			doArchive,
			doWiki,
			doArchlist,
		}

		if (watch && options.doArchlist) {
			console.warn("--watch disables --archlist to avoid feedback loops")
			options.doArchlist = false
		}

		let hadError = false
		const processEntry = createProcessEntry(
			repoExtension,
			roots,
			options,
			gitExtension,
		)
		for (const input of inputs) {
			hadError = (await processEntry(input)) || hadError
		}

		if (watch) {
			hadError = (await watchArchlist(processEntry)) || hadError
		}

		if (hadError) {
			process.exit(1)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(message)
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
				createRootsPlugin(),
				createRepoPlugin(),
				createGitPlugin(),
			],
		})
	}
})()
