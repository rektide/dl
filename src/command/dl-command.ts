import { define, type Args, type CommandContext } from "gunshi"
import { OFF } from "../dl/actions.ts"
import { createProcessEntry } from "../dl/index.ts"
import type { DlOptions } from "../dl/types.ts"
import { resolveDlSetup } from "./context.ts"
import type { DlExtensions } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { prependOrg } from "../util/prepend-org.ts"

type DlCommandDef = {
	name: string
	description: string
	usage?: string
	args?: Args
	buildOptions: (values: Record<string, unknown>) => Partial<DlOptions>
}

function baseOptions(values: Record<string, unknown>): DlOptions {
	return {
		consumeDexportOutput: !!values["consume-dexport-output"],
		noLogCache: !!values["no-log-cache"],
		reportLifecycle: !!values["report-lifecycle"],
		archiveState: OFF,
		wikiState: OFF,
		archlistState: OFF,
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
			run: async (ctx: CommandContext<{ args: typeof mergedArgs; extensions: DlExtensions }>) => {
			const inputs = prependOrg(undefined, ctx.positionals)
			if (inputs.length === 0) {
				console.error(def.usage ?? `usage: rekon dl ${def.name} <repo-url|org/repo> [...]`)
				process.exit(1)
			}

			const options: DlOptions = { ...baseOptions(ctx.values as Record<string, unknown>), ...def.buildOptions(ctx.values as Record<string, unknown>) }
			const setup = await resolveDlSetup(ctx.extensions, options)
			let hadError = false
			const processEntry = createProcessEntry(
				setup.repo,
				setup.roots,
				options,
				setup.log,
				setup.git,
				setup.dexport,
			)

			for (const input of inputs) {
				hadError = (await processEntry(input)) || hadError
			}

			if (hadError) process.exit(1)
		},
	})
}
