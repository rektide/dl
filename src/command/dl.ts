#!/usr/bin/env node
import { realpath } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { defineWithTypes, cli, type CommandContext, type ArgValues } from "gunshi"
import { DL_COMMAND_NAME } from "../dl/args.ts"
import type { DlActionToken } from "../dl/action-registry.ts"
import { createProcessEntry } from "../dl/index.ts"
import type { DlOptions } from "../dl/types.ts"
import { OFF } from "../dl/actions.ts"
import { watchClipboard } from "../dl/clipboard.ts"
import { watchArchlist } from "../dl/watch.ts"
import { prependOrg } from "../util/prepend-org.ts"
import { buildBaseOptions } from "../util/command.ts"
import { dlPlugins } from "../plugin/index.ts"
import { requireExtensions, type DlExtensions } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { sharedArgs } from "../arg/shared.ts"
import archlistSubcommand from "./archlist.ts"
import symlinkSubcommand from "./symlink.ts"

const dlArgs = {
	...globalArgs,
	...sharedArgs,
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
	anycase: {
		type: "boolean",
		default: false,
		description: "Also create symlinks for pure case differences (e.g. Rust→rust)",
	},
} as const

type DlArgs = typeof dlArgs

function buildDlOptions(
	values: ArgValues<DlArgs>,
	explicit: Record<string, boolean | undefined>,
	tokens: ReadonlyArray<DlActionToken>,
	extensions: ReturnType<typeof requireExtensions>,
): DlOptions {
	const actionOptions = extensions.actions.resolveActionOptions(
		values as Record<string, unknown>,
		explicit,
		tokens,
	)

	return {
		...buildBaseOptions(values as Record<string, unknown>),
		archiveState: actionOptions.archiveState ?? OFF,
		wikiState: actionOptions.wikiState ?? OFF,
		archlistState: actionOptions.archlistState ?? OFF,
		symlinkState: actionOptions.symlinkState ?? OFF,
		anycase: !!values.anycase,
		expand: !!values.expand,
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

		const ext = requireExtensions(ctx.extensions)
		const roots = await ext.roots.resolveRoots()
		const options = buildDlOptions(
			ctx.values,
			ctx.explicit as Record<string, boolean | undefined>,
			ctx.tokens,
			ext,
		)

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

const dlCommand = defineWithTypes<{ args: DlArgs; extensions: DlExtensions }>()({
	name: DL_COMMAND_NAME,
	description: "Fetch repository checkout and wiki checkout",
	args: dlArgs,
	run,
})

export default dlCommand

function main() {
	cli(process.argv.slice(2), dlCommand, {
		name: DL_COMMAND_NAME,
		plugins: dlPlugins,
		subCommands: {
			archlist: archlistSubcommand,
			symlink: symlinkSubcommand,
		},
		fallbackToEntry: true,
	})
}

realpath(process.argv[1]).then((mainPath) => {
	if (pathToFileURL(mainPath).href === import.meta.url) main()
})
