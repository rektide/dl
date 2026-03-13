import type { DestinationRoots, ProcessInputOptions, RepoContext } from "../../dl/types.ts"
import { resolveDexportPath } from "./path.ts"
import { runDexport, runDexportDetached } from "./launch.ts"
import { chooseDexportPlan } from "./policy.ts"

export async function syncGithubWiki(
	resolved: RepoContext,
	roots: DestinationRoots,
	options: ProcessInputOptions,
	wikiDestination: string,
): Promise<void> {
	const dexportPath = await resolveDexportPath()
	if (!dexportPath) {
		console.warn("dexport skipped: not found at ~/src/dexport/src/cli.ts")
		return
	}

	const deepwikiUrl = resolved.deepwikiUrl
	const plan = await chooseDexportPlan(
		wikiDestination,
		options.consumeDexportOutput,
	)

	if (plan === "skip-existing") {
		if (!options.noLogCache) {
			console.log(
				`dexport: skipped because ${wikiDestination} already exists`,
			)
		}
		return
	}

	if (plan === "queue") {
		try {
			runDexportDetached(dexportPath, roots.wikiRoot, deepwikiUrl)
			console.log(`dexport: queued ${deepwikiUrl}`)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.warn(`dexport skipped: ${message}`)
		}
		return
	}

	try {
		console.log(`dexport: running ${deepwikiUrl}`)
		await runDexport(dexportPath, roots.wikiRoot, deepwikiUrl)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.warn(`dexport skipped: ${message}`)
	}
}
