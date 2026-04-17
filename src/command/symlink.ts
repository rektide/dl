import { define, type CommandContext } from "gunshi"
import { OFF, ENSURE, state, type StepState } from "../dl/actions.ts"
import { symlinkHandler } from "../dl/symlink.ts"
import { runPipeline } from "../dl/pipeline.ts"
import type { DlOptions } from "../dl/types.ts"
import { resolveDlSetup } from "./context.ts"
import { globalArgs } from "../arg/global.ts"
import { prependOrg } from "../util/prepend-org.ts"

const args = {
	...globalArgs,
	state: {
		type: "string",
		default: "ensure",
		description: "Symlink state (ensure|off)",
	},
} as const

const VALID_STATES = new Set<string>([ENSURE, OFF])

function resolveState(value: string): StepState {
	return VALID_STATES.has(value) ? state(value) : ENSURE
}

async function run(ctx: CommandContext<{ args: typeof args }>) {
	const inputs = prependOrg(undefined as any, ctx.positionals)
	if (inputs.length === 0) {
		console.error("usage: rekon dl symlink [--state=ensure|off] <repo-url|org/repo> [...]")
		process.exit(1)
	}

	const symlinkState = resolveState(ctx.values.state)
	const options: DlOptions = {
		consumeDexportOutput: !!ctx.values["consume-dexport-output"],
		noLogCache: !!ctx.values["no-log-cache"],
		reportLifecycle: !!ctx.values["report-lifecycle"],
		doArchive: false,
		doWiki: false,
		archlistState: OFF,
		doSymlink: true,
		symlinkState,
		expand: false,
		dryRun: !!ctx.values["dry-run"],
	}

	const setup = await resolveDlSetup(ctx.extensions as Record<string, unknown>, options)
	let hadError = false

	for (const input of inputs) {
		let found = false
		for await (const resolved of setup.repo.resolve(input)) {
			found = true
			const had = await runPipeline(resolved, { roots: setup.roots, options, log: setup.log }, [symlinkHandler], options.reportLifecycle, setup.log)
			if (had) hadError = true
		}
		if (!found) setup.log.warn("sync", "no_match", { input })
	}

	if (hadError) process.exit(1)
}

export default define({
	name: "symlink",
	description: "Create simplified symlinks for org/repo names",
	args,
	run,
})
