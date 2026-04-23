// pattern: Functional Core

import type { FlowContext, Repo, RepoIdentity, RepoStream } from "../types.ts"

function defaultIdentity(repo: Repo): string {
	return repo.url.toString()
}

export async function* dedupeRepos(
	input: RepoStream<Repo>,
	ctx: FlowContext,
	identity: RepoIdentity = defaultIdentity,
): AsyncGenerator<Repo> {
	for await (const repo of input) {
		const key = identity(repo)
		if (ctx.dedupe.has(key)) continue
		ctx.dedupe.add(key)
		yield repo
	}
}
