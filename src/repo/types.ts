import type { RepoContext } from "./context.ts"

export interface Source {
	expander?: string
	provider?: string
}

export interface Repo {
	name: string
	resolve(url: URL, signal: AbortSignal): Promise<RepoContext | undefined>
	resolveWikiRepo?(ctx: RepoContext): void
	resolveWikiDeep?(ctx: RepoContext): void
}

export interface RepoRegistry {
	byHost: Map<string, Repo>
	generic: Repo

	register(provider: Repo, hosts?: string[]): void
	lookup(host: string): Repo
}
