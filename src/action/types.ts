import type { LogExtension } from "../plugin/log.ts"
import type { StepState } from "./state.ts"
import type { GitOps } from "../git/types.ts"
import type { DexportOps } from "../dexport/types.ts"

export interface DlOptions {
	consumeDexportOutput: boolean
	noLogCache: boolean
	reportLifecycle: boolean
	archiveState: StepState
	wikiState: StepState
	deepwikiState: StepState
	archlistState: StepState
	symlinkState: StepState
	anycase: boolean
	expand: boolean
	dryRun: boolean
}

export interface DlContext {
	roots: { archiveRoot: string; wikiRoot: string }
	options: DlOptions
	log: LogExtension
	gitOps?: GitOps
	dexportOps?: DexportOps
}
