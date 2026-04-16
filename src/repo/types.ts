import type { RepoContext } from "./context.ts"

export interface Source {
	provider?: string
}

export interface Repo {
	name: string
	hosts: string[]
	candidates(input: string): RepoContext[]
	verify(ctx: RepoContext, signal: AbortSignal): Promise<RepoContext | undefined>
	resolveWikiRepo?(ctx: RepoContext): void
	resolveWikiDeep?(ctx: RepoContext): void
}

export interface RepoRegistry {
	byHost: Map<string, Repo>
	providers: Repo[]
	generic: Repo

	register(provider: Repo): void
	lookup(host: string): Repo
}
