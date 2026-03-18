import type { Source } from "./types.ts"

export interface RepoContext {
	input?: string
	inputUrl?: URL
	url?: URL
	source: Source

	wikiDeepUrl?: URL
	wikiRepoUrl?: URL

	readonly project: string | undefined
    readonly org: string | undefined
}

export class DefaultRepoContext implements RepoContext {
	input?: string
	inputUrl?: URL
	url?: URL
	source: Source = {}
	wikiDeepUrl?: URL
	wikiRepoUrl?: URL

	get project(): string | undefined {
		if (!this.url) return undefined
		const base = this.url.pathname.split("/").filter(Boolean).at(-1)
		return base?.replace(/\.git$/, "")
	}

	get org(): string | undefined {
		if (!this.url) return undefined
		const segments = this.url.pathname.split("/").filter(Boolean)
		if (segments.length < 2) return undefined
		return segments
			.slice(0, -1)
			.map((s) => s.replace(/\.git$/, ""))
			.join("/")
	}

}
