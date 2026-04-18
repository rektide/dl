import { OFF } from "../action/state.ts"
import { createProcessEntry } from "./run.ts"
import type { DlOptions } from "../action/types.ts"
import type { DlExtensions } from "./context.ts"
import { resolveDlSetup } from "./context.ts"

export function buildBaseOptions(values: Record<string, unknown>): DlOptions {
	return {
		consumeDexportOutput: !!values["consume-dexport-output"],
		noLogCache: !!values["no-log-cache"],
		reportLifecycle: !!values["report-lifecycle"],
		archiveState: OFF,
		wikiState: OFF,
		deepwikiState: OFF,
		archlistState: OFF,
		symlinkState: OFF,
		anycase: false,
		expand: false,
		dryRun: !!values["dry-run"],
	}
}

export async function runEntries(
	extensions: DlExtensions,
	options: DlOptions,
	inputs: readonly string[],
): Promise<boolean> {
	const setup = await resolveDlSetup(extensions, options)
	const handlers = setup.actions["dl:handlers"]
	const processEntry = createProcessEntry(
		handlers,
		setup.repo,
		setup.roots,
		options,
		setup.log,
	)
	let hadError = false
	for (const input of inputs) {
		hadError = (await processEntry(input)) || hadError
	}
	return hadError
}
