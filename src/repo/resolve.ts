import type { RepoContext } from "./context.ts"
import type { RepoRegistry } from "./types.ts"
import { RESOLVE_TIMEOUT } from "./util.ts"

export async function* collectCandidates(
	input: string,
	registry: RepoRegistry,
): AsyncGenerator<RepoContext> {
	const seen = new Set<string>()

	for (const provider of registry.providers) {
		for await (const ctx of provider.candidates(input)) {
			const key = ctx.url?.toString()
			if (!key || seen.has(key)) continue
			seen.add(key)
			ctx.input = input
			ctx.inputUrl = ctx.url
			yield ctx
		}
	}
}

export async function* verifyCandidates(
	candidates: AsyncGenerator<RepoContext>,
	registry: RepoRegistry,
	signal?: AbortSignal,
): AsyncGenerator<RepoContext> {
	const resolveSignal = signal ?? AbortSignal.timeout(RESOLVE_TIMEOUT)

	for await (const ctx of candidates) {
		if (!ctx.url) continue
		const repo = registry.lookup(ctx.url.host)

		for await (const verified of repo.verify(ctx, resolveSignal)) {
			verified.source.provider = repo.name
			yield verified
		}
	}
}

export function enrich(ctx: RepoContext, registry: RepoRegistry): void {
	if (!ctx.url) return
	const repo = registry.lookup(ctx.url.host)
	repo.resolveWikiDeep?.(ctx)
	repo.resolveWikiRepo?.(ctx)
}
