import type { RepoContext } from "./context.ts"
import type { RepoRegistry } from "./types.ts"
import { RESOLVE_TIMEOUT } from "./util.ts"

export async function* verify(
	input: string,
	candidates: { url: URL; expander: string }[],
	registry: RepoRegistry,
	signal?: AbortSignal,
): AsyncGenerator<RepoContext> {
	const resolveSignal = signal ?? AbortSignal.timeout(RESOLVE_TIMEOUT)
	for (const candidate of candidates) {
		const repo = registry.lookup(candidate.url.host)
		const ctx = await repo.resolve(candidate.url, resolveSignal)
		if (!ctx) continue

		ctx.input = input
		ctx.inputUrl = candidate.url
		ctx.source.expander = candidate.expander
		ctx.source.provider = repo.name
		yield ctx
	}
}

export function enrich(ctx: RepoContext, registry: RepoRegistry): void {
	if (!ctx.url) return
	const repo = registry.lookup(ctx.url.host)
	repo.resolveWikiDeep?.(ctx)
	repo.resolveWikiRepo?.(ctx)
}
