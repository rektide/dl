import type { LogExtension } from "../plugin/log.ts"

export interface ParsedArgs {
	inputs: string[]
	watch: boolean
	consumeDexportOutput: boolean
	noLogCache: boolean
	doArchive: boolean
	doWiki: boolean
	doArchlist: boolean
}

export interface ProcessInputOptions {
	consumeDexportOutput: boolean
	noLogCache: boolean
	doArchive: boolean
	doWiki: boolean
	doArchlist: boolean
}

export interface DestinationRoots {
	archiveRoot: string
	wikiRoot: string
}

export interface DlContext {
	roots: DestinationRoots
	options: ProcessInputOptions
	log: LogExtension
}
