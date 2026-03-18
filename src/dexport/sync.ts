import type { DexportOps } from "./types.ts"
import type { LogExtension } from "../plugin/log.ts"
import { resolveDexportPath } from "./path.ts"
import { runDexport, runDexportDetached } from "./launch.ts"
import { chooseDexportPlan } from "./policy.ts"

export const syncDexportWiki: DexportOps["sync"] = async (
	resolved,
	roots,
	options,
	wikiDestination,
	log,
) => {
	const dexportPath = await resolveDexportPath()
	if (!dexportPath) {
		log.warn("sync", "dexport_skipped", { reason: "not found at ~/src/dexport/src/cli.ts" })
		return
	}

	const deepwikiUrl = resolved.deepwikiUrl?.toString()
	if (!deepwikiUrl) {
		log.warn("sync", "dexport_skipped", { reason: "no deepwiki URL for this repository" })
		return
	}

	const plan = await chooseDexportPlan(
		wikiDestination,
		options.consumeDexportOutput,
	)

	if (plan === "skip-existing") {
		if (!options.noLogCache) {
			log.info("sync", "dexport_skipped", { reason: "already exists", destination: wikiDestination })
		}
		return
	}

	if (plan === "queue") {
		try {
			runDexportDetached(dexportPath, roots.wikiRoot, deepwikiUrl)
			log.info("sync", "dexport_queued", { url: deepwikiUrl })
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			log.warn("sync", "dexport_skipped", { message })
		}
		return
	}

	try {
		log.info("sync", "dexport_running", { url: deepwikiUrl })
		await runDexport(dexportPath, roots.wikiRoot, deepwikiUrl)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		log.warn("sync", "dexport_skipped", { message })
	}
}
