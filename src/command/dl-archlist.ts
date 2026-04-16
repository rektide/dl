import { define, type CommandContext } from "gunshi"
import { DL_COMMAND_NAME } from "../dl/args.ts"
import { OFF, FORCE, ENSURE, type StepState, state } from "../dl/actions.ts"
import { archlistHandler } from "../dl/archlist.ts"
import { runPipeline } from "../dl/pipeline.ts"
import type { DlOptions } from "../dl/types.ts"
import { requireExtensions, resolveDlSetup, type DlExtensions } from "./dl-shared.ts"
import { prependOrg } from "./prepend-org.ts"

const args = {
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
	"dry-run": {
		type: "boolean",
		default: false,
		description: "Show what would be done without making changes",
	},
	state: {
		type: "string",
		default: "force",
		description: "Archlist state (force|ensure|off)",
	},
} as const

function resolveState(value: string): StepState {
	const s = state(value)
	if (s !== FORCE && s !== ENSURE && s !== OFF) return FORCE
	return s
}

async function run(ctx: CommandContext<{ args: typeof args; extensions: DlExtensions }>) {
	const inputs = prependOrg(undefined as any, ctx.positionals)
	if (inputs.length === 0) {
		console.error("usage: rekon dl archlist [--state=force|ensure|off] <repo-url|org/repo> [...]")
		process.exit(1)
	}

	const archlistState = resolveState(ctx.values.state)
	const options: DlOptions = {
		consumeDexportOutput: !!ctx.values["consume-dexport-output"],
		noLogCache: !!ctx.values["no-log-cache"],
		reportLifecycle: !!ctx.values["report-lifecycle"],
		doArchive: false,
		doWiki: false,
		archlistState,
		doSymlink: false,
		expand: false,
		dryRun: !!ctx.values["dry-run"],
	}

	const setup = await resolveDlSetup(ctx, options)
	let hadError = false

	for (const input of inputs) {
		let found = false
		for await (const resolved of setup.repo.resolve(input)) {
			found = true
			const had = await runPipeline(resolved, { roots: setup.roots, options, log: setup.log }, [archlistHandler], options.reportLifecycle, setup.log)
			if (had) hadError = true
		}
		if (!found) setup.log.warn("sync", "no_match", { input })
	}

	if (hadError) process.exit(1)
}

export default define({
	name: "archlist",
	description: "Append resolved repository URLs to ~/archlist",
	args,
	run,
})
