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
