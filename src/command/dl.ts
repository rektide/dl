#!/usr/bin/env node
import { realpath } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { define, cli, type CommandContext, type ArgValues } from "gunshi"
import { DL_COMMAND_NAME } from "../dl/args.ts"
import { resolveDlFlags } from "../dl/flags.ts"
import { createProcessEntry } from "../dl/index.ts"
import type { DlOptions } from "../dl/types.ts"
import type { ActionDef } from "../dl/actions.ts"
import { FORCE, ENSURE, OFF, buildGunshiArgs, preprocessArgv, resolveActions } from "../dl/actions.ts"
import { watchClipboard } from "../dl/clipboard.ts"
import { watchArchlist } from "../dl/watch.ts"
import { prependOrg } from "../util/prepend-org.ts"
import { createDlPlugins } from "../plugin/index.ts"
import { requireExtensions } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { sharedArgs } from "../arg/shared.ts"
import archlistSubcommand from "./archlist/index.ts"

const ARCHLIST_ACTION: ActionDef = {
	name: "archlist",
	states: [FORCE, ENSURE, OFF],
	defaultState: FORCE,
}

const ACTIONS: readonly ActionDef[] = [ARCHLIST_ACTION]

const actionArgs = buildGunshiArgs(ACTIONS)

const dlArgs = {
	...globalArgs,
	...sharedArgs,
	...actionArgs,
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
} as const

type DlArgs = typeof dlArgs

function buildDlOptions(
	values: ArgValues<DlArgs>,
	explicit: Record<string, boolean>,
): DlOptions {
	const actionResult = resolveActions(ACTIONS, values, explicit)

	const oldFlags = resolveDlFlags(
		{ archive: !!values.archive, wiki: !!values.wiki, symlink: !!values.symlink },
		{ archive: !!explicit.archive, wiki: !!explicit.wiki, symlink: !!explicit.symlink },
	)

	const anyExplicit = oldFlags.anyExplicit || actionResult.anyExplicit

	let doArchive = oldFlags.doArchive
	let doWiki = oldFlags.doWiki
	let doSymlink = oldFlags.doSymlink

	if (actionResult.anyExplicit && !oldFlags.anyExplicit) {
		if (!explicit.archive) doArchive = false
		if (!explicit.wiki) doWiki = false
		if (!explicit.symlink) doSymlink = !!values.symlink
	}

	let archlistState = actionResult.states.archlist
	if (anyExplicit && !actionResult.explicit.archlist) {
		archlistState = OFF
	}

	return {
		consumeDexportOutput: !!values["consume-dexport-output"],
		noLogCache: !!values["no-log-cache"],
		reportLifecycle: !!values["report-lifecycle"],
		doArchive,
		doWiki,
		archlistState,
		doSymlink,
		expand: !!values.expand,
		dryRun: !!values["dry-run"],
	}
}

async function run(ctx: CommandContext<{ args: DlArgs }>) {
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

		const ext = requireExtensions(ctx.extensions as Record<string, unknown>)
		const roots = await ext.roots.resolveRoots()
		const options = buildDlOptions(ctx.values, ctx.explicit)

		if (watch && options.archlistState !== OFF) {
			ext.log.warn("sync", "archlist_disabled", { reason: "watch mode feedback loop" })
			options.archlistState = OFF
		}

		if (ctx.values.candidates) {
			for (const input of inputs) {
				let found = false
				for await (const candidate of ext.repo.candidates(input)) {
					found = true
					ext.log.info("candidates", "expanded", {
						input,
						url: candidate.url?.toString(),
						org: candidate.org,
						project: candidate.project,
						provider: candidate.source.provider,
						verified: candidate.verified,
					})
				}
				if (!found) {
					ext.log.warn("candidates", "no_match", { input })
				}
			}
			return
		}

		if (options.expand) {
			for (const input of inputs) {
				let found = false
				for await (const resolved of ext.repo.resolve(input)) {
					found = true
					ext.log.info("expand", "resolved", {
						input,
						url: resolved.url?.toString(),
						pathname: resolved.url?.pathname,
						wikiRepoUrl: resolved.wikiRepoUrl?.toString(),
						source: resolved.source,
					})
				}
				if (!found) {
					ext.log.warn("expand", "no_match", { input })
				}
			}
			return
		}

		let hadError = false
		const processEntry = createProcessEntry(
			ext.repo,
			roots,
			options,
			ext.log,
			ext.git,
			ext.dexport,
		)

		for (const input of inputs) {
			hadError = (await processEntry(input)) || hadError
		}

		if (watch) {
			hadError = (await watchArchlist(processEntry, ext.log)) || hadError
		}

		if (clipboard) {
			hadError = (await watchClipboard(processEntry, ext.log)) || hadError
		}

		if (hadError) {
			process.exit(1)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`sync failed: ${message}`)
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
	const argv = preprocessArgv(process.argv.slice(2), ACTIONS)
	cli(argv, dlCommand, {
		name: DL_COMMAND_NAME,
		plugins: createDlPlugins(),
		subCommands: {
			archlist: archlistSubcommand,
		},
		fallbackToEntry: true,
	})
}

realpath(process.argv[1]).then((mainPath) => {
	if (pathToFileURL(mainPath).href === import.meta.url) main()
})
