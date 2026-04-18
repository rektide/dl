#!/usr/bin/env node
import { realpath } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { defineWithTypes, cli, type CommandContext } from "gunshi"
import {
	processEntries,
	processCandidates,
	processExpand,
	buildMainOptions,
} from "./run.ts"
import { OFF } from "../action/state.ts"
import type { DlOptions } from "../action/types.ts"
import { dlPlugins } from "../plugin/index.ts"
import {
	POSITIONAL_INPUT_PLUGIN_ID,
} from "../plugin/input-positional.ts"
import {
	WATCH_INPUT_PLUGIN_ID,
} from "../plugin/input-watch.ts"
import {
	CLIPBOARD_INPUT_PLUGIN_ID,
} from "../plugin/input-clipboard.ts"
import {
	RESOLVE_STREAM_PLUGIN_ID,
} from "../plugin/resolve-stream.ts"
import { requireExtensions, type DlCommandParams, type DlExtensions } from "./context.ts"
import archlistSubcommand from "./archlist.ts"
import archiveSubcommand from "./archive.ts"
import deepwikiSubcommand from "./deepwiki.ts"
import symlinkSubcommand from "./symlink.ts"
import wikiSubcommand from "./wiki.ts"

const dlArgs = {
	noop: {
		type: "boolean",
		default: false,
		description: "Do nothing — exit immediately without resolving or syncing",
	},
} as const

type DlArgs = typeof dlArgs

async function run(ctx: CommandContext<{ args: DlArgs; extensions: DlExtensions }>) {
	try {
		const positional = ctx.extensions[POSITIONAL_INPUT_PLUGIN_ID]
		const watch = ctx.extensions[WATCH_INPUT_PLUGIN_ID]
		const clipboard = ctx.extensions[CLIPBOARD_INPUT_PLUGIN_ID]
		const hasInputs = ctx.positionals.length > 0

		if (!hasInputs && !watch.active && !clipboard.active) {
			console.error(
				"usage: rekon dl [--watch] [--clipboard] [--org <org>] <repo-url|org/repo> [repo-url|org/repo ...]",
			)
			process.exit(1)
		}

		if (ctx.values.noop) return

		const ext = requireExtensions(ctx.extensions)
		const options = buildMainOptions(
			ctx.extensions,
			ctx.values,
			ctx.explicit,
			ctx.tokens,
		)

		if (watch.active && options.archlistState !== OFF) {
			ext.log.warn("sync", "archlist_disabled", { reason: "watch mode feedback loop" })
			options.archlistState = OFF
		}

		const inputs = positional.source(ctx.values.org as string | undefined, ctx.positionals) // gunshi: plugin-registered global
		const stream = ctx.extensions[RESOLVE_STREAM_PLUGIN_ID]

		if (ctx.values.candidates) {
			await processCandidates(ctx.extensions, inputs)
			return
		}

		if (options.expand) {
			await processExpand(ctx.extensions, inputs)
			return
		}

		const sources: AsyncIterable<string>[] = [inputs]
		if (watch.active) sources.push(watch.source())
		if (clipboard.active) sources.push(clipboard.source())

		const hadError = await processEntries(ctx.extensions, options, mergeConcurrent(sources))
		if (hadError) {
			process.exit(1)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`sync failed: ${message}`)
		process.exit(1)
	}
}

async function* mergeConcurrent(sources: AsyncIterable<string>[]): AsyncGenerator<string> {
	for (const source of sources) {
		yield* source
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
