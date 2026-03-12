export interface ParsedArgs {
	inputs: string[]
	watch: boolean
	consumeDexportOutput: boolean
	noLogCache: boolean
	doArchive: boolean
	doWiki: boolean
	doArchlist: boolean
}

export interface RepoContext {
	input: string
	host: string
	namespacePath: string
	org: string
	repo: string
	cloneUrl: string
	repoUrl: string
	deepwikiUrl: string
	wikiCloneUrl: string
}

export type ResolvedRepo = RepoContext

export interface ParsedRepositoryInput {
	host?: string
	repoPathCandidates: string[]
	preferGitHub: boolean
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
