#!/usr/bin/env node
import { realpath } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { define, cli, type CommandContext, type ArgValues } from "gunshi"
import { c12 } from "gunshi-c12"
import { DL_COMMAND_NAME } from "../dl/args.ts"
import { resolveDlFlags } from "../dl/flags.ts"
import { createProcessEntry } from "../dl/index.ts"
import type { DlOptions } from "../dl/types.ts"
import { watchClipboard } from "../dl/clipboard.ts"
import { watchArchlist } from "../dl/watch.ts"
import { prependOrg } from "./prepend-org.ts"
import { createDlPlugins } from "../plugin/index.ts"
import {
	DEXPORT_PLUGIN_ID,
	type DexportExtension,
} from "../plugin/dexport.ts"
import {
	GIT_PLUGIN_ID,
	type GitExtension,
} from "../plugin/git.ts"
import {
	REPO_PLUGIN_ID,
	type RepoExtension,
} from "../plugin/repo.ts"
import {
	ROOTS_PLUGIN_ID,
	type RootsExtension,
} from "../plugin/roots.ts"
import {
	LOG_PLUGIN_ID,
	type LogExtension,
} from "../plugin/log.ts"

const dlArgs = {
	org: {
		type: "string",
		description: "Default org prefix; positional args are treated as repo names and org is prepended",
	},
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
	symlink: {
		type: "boolean",
		short: "l",
		default: true,
		description: "Create simplified symlinks for org/repo names (on by default, use --no-symlink to disable)",
	},
	watch: {
		type: "boolean",
		default: false,
		description: "Watch ~/archlist and process appended entries serially",
	},
	clipboard: {
		type: "boolean",
		default: false,
		description: "Watch system clipboard for URLs and process them serially",
	},
	expand: {
		type: "boolean",
		default: false,
		description: "Output resolved repo info without syncing",
	},
	candidates: {
		type: "boolean",
		default: false,
		description: "Print expanded candidate URLs before verification (no network calls)",
	},
	noop: {
		type: "boolean",
		default: false,
		description: "Do nothing — exit immediately without resolving or syncing",
	},
	"dry-run": {
		type: "boolean",
		default: false,
		description: "Show what would be done without making changes",
	},
} as const

type DlArgs = typeof dlArgs

interface DlExtensions {
	[ROOTS_PLUGIN_ID]: RootsExtension
	[REPO_PLUGIN_ID]: RepoExtension
	[GIT_PLUGIN_ID]: GitExtension
	[DEXPORT_PLUGIN_ID]: DexportExtension
	[LOG_PLUGIN_ID]: LogExtension
}

function requireExtensions(extensions: DlExtensions) {
	const log = extensions[LOG_PLUGIN_ID]
	const roots = extensions[ROOTS_PLUGIN_ID]
	const repo = extensions[REPO_PLUGIN_ID]
	const git = extensions[GIT_PLUGIN_ID]
	const dexport = extensions[DEXPORT_PLUGIN_ID]
	if (!log) throw new Error("dl: log plugin extension is not available")
	if (!roots) throw new Error("dl: roots plugin extension is not available")
	if (!repo) throw new Error("dl: repo plugin extension is not available")
	if (!git) throw new Error("dl: git plugin extension is not available")
	if (!dexport) throw new Error("dl: dexport plugin extension is not available")
	return { log, roots, repo, git, dexport }
}

function buildDlOptions(
	values: ArgValues<DlArgs>,
	explicit: { archive: boolean; wiki: boolean; archlist: boolean; symlink: boolean },
): DlOptions {
	const flags = resolveDlFlags(
		{ archive: values.archive, wiki: values.wiki, archlist: values.archlist, symlink: values.symlink },
		explicit,
	)
	return {
		consumeDexportOutput: values["consume-dexport-output"],
		noLogCache: values["no-log-cache"],
		reportLifecycle: values["report-lifecycle"],
		...flags,
		expand: values.expand,
		dryRun: values["dry-run"],
	}
}

async function run(ctx: CommandContext<{ args: DlArgs; extensions: DlExtensions }>) {
	try {
		const { org, watch, clipboard } = ctx.values
		const inputs = prependOrg(org, ctx.positionals)

		if (inputs.length === 0 && !watch && !clipboard) {
			console.error(
				"usage: rekon dl [--watch] [--clipboard] [--org <org>] <repo-url|org/repo> [repo-url|org/repo ...]",
			)
			process.exit(1)
		}

		if (ctx.values.noop) return

		const { log: logExtension, roots: rootsExtension, repo: repoExtension, git: gitExtension, dexport: dexportExtension } = requireExtensions(ctx.extensions)
		const roots = await rootsExtension.resolveRoots()
		const options = buildDlOptions(ctx.values, ctx.explicit)

		if (watch && options.doArchlist) {
			logExtension.warn("sync", "archlist_disabled", { reason: "watch mode feedback loop" })
			options.doArchlist = false
		}

		if (ctx.values.candidates) {
			for (const input of inputs) {
				const candidates = repoExtension.candidates(input)
				if (candidates.length === 0) {
					logExtension.warn("candidates", "no_match", { input })
				}
				for (const candidate of candidates) {
					logExtension.info("candidates", "expanded", {
						input,
						url: candidate.url.toString(),
						expander: candidate.expander,
						provider: candidate.provider,
					})
				}
			}
			return
		}

		if (options.expand) {
			for (const input of inputs) {
				let found = false
				for await (const resolved of repoExtension.resolve(input)) {
					found = true
					logExtension.info("expand", "resolved", {
						input,
						url: resolved.url?.toString(),
						pathname: resolved.url?.pathname,
						wikiRepoUrl: resolved.wikiRepoUrl?.toString(),
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

		if (clipboard) {
			hadError = (await watchClipboard(processEntry, logExtension)) || hadError
		}

		if (hadError) {
			process.exit(1)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		const log = ctx.extensions[LOG_PLUGIN_ID]
		if (log) {
			log.error("sync", "failed", { message })
		} else {
			console.error(`sync failed: ${message}`)
		}
		process.exit(1)
	}
}

const dlCommand = define({
	name: DL_COMMAND_NAME,
	description: "Fetch repository checkout and wiki checkout",
	args: dlArgs,
	run,
})

export default dlCommand

function main() {
	cli(process.argv.slice(2), dlCommand, {
		name: DL_COMMAND_NAME,
		plugins: createDlPlugins(),
	})
}

realpath(process.argv[1]).then((mainPath) => {
	if (pathToFileURL(mainPath).href === import.meta.url) main()
})
