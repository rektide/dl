import type { DlOptions } from "../action/types.ts"
import type { RepoContext } from "../repo/context.ts"
import type { LogExtension } from "../plugin/log.ts"
import type { DexportPlan } from "./policy.ts"

export type DexportSyncStatus = "skipped" | "queued" | "ran" | "failed"

export type DexportSyncReport = {
	readonly plan: DexportPlan | "unavailable"
	readonly status: DexportSyncStatus
	readonly reason: string | null
}

export interface DexportOps {
	sync: (
		resolved: RepoContext,
		roots: { archiveRoot: string; wikiRoot: string },
		options: DlOptions,
		wikiDestination: string,
		log: LogExtension,
	) => Promise<DexportSyncReport>
}
