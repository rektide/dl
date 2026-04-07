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
		const reason = "not found at ~/src/dexport/src/cli.ts"
		log.warn("sync", "dexport_skipped", { reason })
		return { plan: "unavailable", status: "skipped", reason }
	}

	const wikiDeepUrl = resolved.wikiDeepUrl?.toString()
	if (!wikiDeepUrl) {
		const reason = "no deepwiki URL for this repository"
		log.warn("sync", "dexport_skipped", { reason })
		return { plan: "unavailable", status: "skipped", reason }
	}

	const plan = await chooseDexportPlan(
		wikiDestination,
		options.consumeDexportOutput,
	)

	if (plan === "skip-existing") {
		if (!options.noLogCache) {
			log.info("sync", "dexport_skipped", { reason: "already exists", destination: wikiDestination })
		}
		return { plan, status: "skipped", reason: "already exists" }
	}

	if (plan === "queue") {
		try {
			runDexportDetached(dexportPath, roots.wikiRoot, wikiDeepUrl)
			log.info("sync", "dexport_queued", { url: wikiDeepUrl })
			return { plan, status: "queued", reason: null }
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			log.warn("sync", "dexport_skipped", { message })
			return { plan, status: "failed", reason: message }
		}
	}

	try {
		log.info("sync", "dexport_running", { url: wikiDeepUrl })
		await runDexport(dexportPath, roots.wikiRoot, wikiDeepUrl)
		return { plan, status: "ran", reason: null }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		log.warn("sync", "dexport_skipped", { message })
		return { plan, status: "failed", reason: message }
	}
}
