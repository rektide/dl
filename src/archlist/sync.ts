import { appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { OFF, type StepState } from "../action/state.ts";
import type { Reporter } from "../report/types.ts";
import type { LogExtension } from "../plugin/log.ts";
import type { ActionResult } from "../planner/types.ts";
import { decideArchlist } from "./decide.ts";

export async function syncArchlist(
  url: string,
  archlistState: StepState,
  report: Reporter,
  log: LogExtension,
  archlistPath?: string,
): Promise<ActionResult> {
  const resolvedPath = archlistPath ?? join(homedir(), "archlist");

  if (archlistState === OFF) {
    report.skipped({
      step: "archlist",
      source: "syncArchlist",
      event: "off",
    });
    return { hadError: false };
  }

  log.info("sync", "archlist", { url, path: resolvedPath, state: archlistState });

  let fileContent: string | null = null;
  try {
    fileContent = await readFile(resolvedPath, "utf-8");
  } catch {}

  const decision = decideArchlist(archlistState, url, fileContent);

  if (decision.action === "skip") {
    report.skipped({
      step: "archlist",
      source: "syncArchlist",
      event: "off",
    });
    return { hadError: false };
  }

  if (decision.action === "already_present") {
    report.ok({
      step: "archlist",
      source: "syncArchlist -> readFile",
      event: "already_present",
      details: { path: resolvedPath },
    });
    return { hadError: false };
  }

  try {
    await appendFile(resolvedPath, `${url}\n`);
    report.ok({
      step: "archlist",
      source: "syncArchlist -> appendFile",
      event: "appended",
      details: { path: resolvedPath },
    });
    return { hadError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("sync", "archlist_failed", { message });
    report.failed({
      step: "archlist",
      source: "syncArchlist -> appendFile",
      event: "error",
      details: { message },
    });
    return { hadError: true };
  }
}
