#!/usr/bin/env node
import { realpath } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { defineWithTypes, cli, type CommandContext, type ArgValues } from "gunshi"
import type { DlActionToken } from "../action/registry.ts"
import { processEntries, processCandidates, processExpand, buildMainOptions } from "./run.ts"
import type { DlOptions } from "../action/types.ts"
import { OFF } from "../action/state.ts"
import { positionalSource, watchSource, clipboardSource, mergeSources } from "./input.ts"
import { dlPlugins } from "../plugin/index.ts"
import { requireExtensions, type DlCommandParams, type DlExtensions } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { sharedArgs } from "../arg/shared.ts"
import archlistSubcommand from "./archlist.ts"
import archiveSubcommand from "./archive.ts"
import deepwikiSubcommand from "./deepwiki.ts"
import symlinkSubcommand from "./symlink.ts"
import wikiSubcommand from "./wiki.ts"

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

async function run(ctx: CommandContext<{ args: DlArgs; extensions: DlExtensions }>) {
	try {
		const { org, watch, clipboard } = ctx.values

		if (ctx.positionals.length === 0 && !watch && !clipboard) {
			console.error(
				"usage: rekon dl [--watch] [--clipboard] [--org <org>] <repo-url|org/repo> [repo-url|org/repo ...]",
			)
			process.exit(1)
		}

		if (ctx.values.noop) return

		const ext = requireExtensions(ctx.extensions)
		const options = buildMainOptions(
			ctx.extensions,
			ctx.values as Record<string, unknown>,
			ctx.explicit as Record<string, boolean | undefined>,
			ctx.tokens,
		)

		if (watch && options.archlistState !== OFF) {
			ext.log.warn("sync", "archlist_disabled", { reason: "watch mode feedback loop" })
			options.archlistState = OFF
		}

		const inputs = positionalSource(org, ctx.positionals)

		if (ctx.values.candidates) {
			await processCandidates(ctx.extensions, inputs)
			return
		}

		if (options.expand) {
			await processExpand(ctx.extensions, inputs)
			return
		}

		const sources = [inputs]
		if (watch) sources.push(watchSource(ext.log))
		if (clipboard) sources.push(clipboardSource(ext.log))

		const hadError = await processEntries(ctx.extensions, options, mergeSources(sources))
		if (hadError) {
			process.exit(1)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`sync failed: ${message}`)
		process.exit(1)
	}
}

const dlCommand = defineWithTypes<DlCommandParams & { args: DlArgs }>()({
	name: "dl",
	description: "Fetch repository checkout and wiki checkout",
	args: dlArgs,
	run,
})

export default dlCommand

function main() {
	cli(process.argv.slice(2), dlCommand, {
		name: "dl",
		plugins: dlPlugins,
		subCommands: {
			archive: archiveSubcommand,
			archlist: archlistSubcommand,
			deepwiki: deepwikiSubcommand,
			symlink: symlinkSubcommand,
			wiki: wikiSubcommand,
		},
		fallbackToEntry: true,
	})
}

realpath(process.argv[1]).then((mainPath) => {
	if (pathToFileURL(mainPath).href === import.meta.url) main()
})
