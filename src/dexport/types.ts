import type { LogExtension } from "../plugin/log.ts";
import type { RunOptions } from "../planner/types.ts";
import type { DexportPlan } from "./policy.ts";

export type DexportSyncStatus = "skipped" | "queued" | "ran" | "failed";

export type DexportSyncReport = {
  readonly plan: DexportPlan | "unavailable";
  readonly status: DexportSyncStatus;
  readonly reason: string | null;
};

export type DexportSyncInput = Readonly<{
  wikiUrl: URL | null;
  roots: { archiveRoot: string; wikiRoot: string; githubWikiRoot: string };
  options: RunOptions;
  wikiDestination: string;
  log: LogExtension;
}>;

export type DexportOps = Readonly<{
  sync: (input: DexportSyncInput) => Promise<DexportSyncReport>;
}>;
