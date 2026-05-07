import type { DexportOps } from "./types.ts";
import { resolveDexportPath } from "./path.ts";
import { runDexport, runDexportDetached } from "./launch.ts";
import { chooseDexportPlan } from "./policy.ts";

export const syncDexportWiki: DexportOps["sync"] = async (input) => {
  const dexportPath = await resolveDexportPath();
  if (!dexportPath) {
    const reason = "not found at ~/src/dexport/src/cli.ts";
    input.log.warn("sync", "dexport_skipped", { reason });
    return { plan: "unavailable", status: "skipped", reason };
  }

  const wikiDeepUrl = input.wikiDeepUrl?.toString();
  if (!wikiDeepUrl) {
    const reason = "no deepwiki URL for this repository";
    input.log.warn("sync", "dexport_skipped", { reason });
    return { plan: "unavailable", status: "skipped", reason };
  }

  const plan = await chooseDexportPlan(input.wikiDestination, input.options.consumeDexportOutput);

  if (plan === "skip-existing") {
    if (!input.options.noLogCache) {
      input.log.info("sync", "dexport_skipped", {
        reason: "already exists",
        destination: input.wikiDestination,
      });
    }
    return { plan, status: "skipped", reason: "already exists" };
  }

  if (plan === "queue") {
    try {
      runDexportDetached(dexportPath, input.roots.wikiRoot, wikiDeepUrl);
      input.log.info("sync", "dexport_queued", { url: wikiDeepUrl });
      return { plan, status: "queued", reason: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.log.warn("sync", "dexport_skipped", { message });
      return { plan, status: "failed", reason: message };
    }
  }

  try {
    input.log.info("sync", "dexport_running", { url: wikiDeepUrl });
    await runDexport(dexportPath, input.roots.wikiRoot, wikiDeepUrl);
    return { plan, status: "ran", reason: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.log.warn("sync", "dexport_skipped", { message });
    return { plan, status: "failed", reason: message };
  }
};
