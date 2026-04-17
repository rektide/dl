import type { LogExtension } from "../plugin/log.ts"
import type { StepState } from "./actions.ts"

export interface DlOptions {
	consumeDexportOutput: boolean
	noLogCache: boolean
	reportLifecycle: boolean
	archiveState: StepState
	wikiState: StepState
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
}
