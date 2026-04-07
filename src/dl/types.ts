import type { LogExtension } from "../plugin/log.ts"

export interface DlOptions {
	consumeDexportOutput: boolean
	noLogCache: boolean
	reportLifecycle: boolean
	doArchive: boolean
	doWiki: boolean
	doArchlist: boolean
	doSimplify: boolean
	expand: boolean
	dryRun: boolean
}

export interface DlContext {
	roots: { archiveRoot: string; wikiRoot: string }
	options: DlOptions
	log: LogExtension
}
