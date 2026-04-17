import { OFF } from "../dl/actions.ts"
import { createProcessEntry } from "../dl/index.ts"
import type { DlOptions } from "../dl/types.ts"
import type { DlExtensions } from "../command/context.ts"
import { resolveDlSetup } from "../command/context.ts"

export function buildBaseOptions(values: Record<string, unknown>): DlOptions {
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

export async function runEntries(
	extensions: DlExtensions | Record<string, unknown>,
	options: DlOptions,
	inputs: readonly string[],
): Promise<boolean> {
	const setup = await resolveDlSetup(extensions, options)
	const processEntry = createProcessEntry(
		setup.repo,
		setup.roots,
		options,
		setup.log,
		setup.git,
		setup.dexport,
	)
	let hadError = false
	for (const input of inputs) {
		hadError = (await processEntry(input)) || hadError
	}
	return hadError
}
