import type { Source } from "./types.ts"

export interface RepoContext {
	input?: string
	org?: string
	project?: string
	host?: string
	verified: boolean
	source: Source

	url?: URL
	inputUrl?: URL
	wikiDeepUrl?: URL
	wikiRepoUrl?: URL
}

export class DefaultRepoContext implements RepoContext {
	input?: string
	org?: string
	project?: string
	host?: string
	verified = false
	source: Source = {}
	url?: URL
	inputUrl?: URL
	wikiDeepUrl?: URL
	wikiRepoUrl?: URL
}
