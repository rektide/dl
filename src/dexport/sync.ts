import type { DexportOps } from "./types.ts"
import { resolveDexportPath } from "./path.ts"
import { runDexport, runDexportDetached } from "./launch.ts"
import { chooseDexportPlan } from "./policy.ts"

export async function syncDexportWiki(
	...args: Parameters<DexportOps["sync"]>
): Promise<void> {
	const [resolved, roots, options, wikiDestination] = args
	const dexportPath = await resolveDexportPath()
	if (!dexportPath) {
		console.warn("dexport skipped: not found at ~/src/dexport/src/cli.ts")
		return
	}

	const deepwikiUrl = resolved.deepwikiUrl?.toString()
	if (!deepwikiUrl) {
		console.warn("dexport skipped: no deepwiki URL for this repository")
		return
	}

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
