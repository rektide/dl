import type { RepoContext } from "./context.ts"
import type { RepoRegistry } from "./types.ts"
import { RESOLVE_TIMEOUT } from "./util.ts"

export function collectCandidates(
	input: string,
	registry: RepoRegistry,
): RepoContext[] {
	const seen = new Set<string>()
	const candidates: RepoContext[] = []

	for (const provider of registry.providers) {
		for (const ctx of provider.candidates(input)) {
			if (!ctx.url) continue
			const key = ctx.url.toString()
			if (seen.has(key)) continue
			seen.add(key)
			ctx.input = input
			ctx.inputUrl = ctx.url
			candidates.push(ctx)
		}
	}

	return candidates
}

export async function* verify(
	input: string,
	registry: RepoRegistry,
	signal?: AbortSignal,
): AsyncGenerator<RepoContext> {
	const resolveSignal = signal ?? AbortSignal.timeout(RESOLVE_TIMEOUT)
	const candidates = collectCandidates(input, registry)

	for (const ctx of candidates) {
		const repo = registry.lookup(ctx.url!.host)
		const verified = await repo.verify(ctx, resolveSignal)
		if (!verified) continue

		verified.source.provider = repo.name
		yield verified
	}
}

export function enrich(ctx: RepoContext, registry: RepoRegistry): void {
	if (!ctx.url) return
	const repo = registry.lookup(ctx.url.host)
	repo.resolveWikiDeep?.(ctx)
	repo.resolveWikiRepo?.(ctx)
}
