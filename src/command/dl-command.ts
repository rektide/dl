import { define, type Args, type ArgValues, type CommandContext } from "gunshi"
import { OFF } from "../dl/actions.ts"
import type { ActionHandler } from "../dl/pipeline.ts"
import { runPipeline } from "../dl/pipeline.ts"
import type { DlOptions } from "../dl/types.ts"
import { resolveDlSetup } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { prependOrg } from "../util/prepend-org.ts"

type DlCommandDef = {
	name: string
	description: string
	usage?: string
	args?: Args
	buildOptions: (values: Record<string, unknown>) => Partial<DlOptions>
	handlers: readonly ActionHandler[]
}

function baseOptions(values: Record<string, unknown>): DlOptions {
	return {
		consumeDexportOutput: !!values["consume-dexport-output"],
		noLogCache: !!values["no-log-cache"],
		reportLifecycle: !!values["report-lifecycle"],
		doArchive: false,
		doWiki: false,
		archlistState: OFF,
		doSymlink: false,
		symlinkState: OFF,
		anycase: false,
		expand: false,
		dryRun: !!values["dry-run"],
	}
}

export function createDlCommand(def: DlCommandDef) {
	const mergedArgs = { ...globalArgs, ...def.args } as const

	return define({
		name: def.name,
		description: def.description,
		args: mergedArgs,
		run: async (ctx: CommandContext<{ args: typeof mergedArgs }>) => {
			const inputs = prependOrg(undefined as any, ctx.positionals)
			if (inputs.length === 0) {
				console.error(def.usage ?? `usage: rekon dl ${def.name} <repo-url|org/repo> [...]`)
				process.exit(1)
			}

			const options: DlOptions = { ...baseOptions(ctx.values as Record<string, unknown>), ...def.buildOptions(ctx.values as Record<string, unknown>) }
			const setup = await resolveDlSetup(ctx.extensions as Record<string, unknown>, options)
			let hadError = false

			for (const input of inputs) {
				let found = false
				for await (const resolved of setup.repo.resolve(input)) {
					found = true
					const had = await runPipeline(resolved, { roots: setup.roots, options, log: setup.log }, def.handlers, options.reportLifecycle, setup.log)
					if (had) hadError = true
				}
				if (!found) setup.log.warn("sync", "no_match", { input })
			}

			if (hadError) process.exit(1)
		},
	})
}
