import type { RepoContext } from "./context.ts"

export interface Source {
	provider?: string
}

export interface Repo {
	name: string
	hosts: string[]
	toUrlString(ctx: RepoContext): string | undefined
	candidates(input: string): AsyncGenerator<RepoContext>
	verify(ctx: RepoContext, signal: AbortSignal): AsyncGenerator<RepoContext>
	resolveWikiRepo?(ctx: RepoContext): void
}

export interface RepoRegistry {
	byHost: Map<string, Repo>
	providers: Repo[]
	generic: Repo

	register(provider: Repo): void
	lookup(host: string): Repo
}
