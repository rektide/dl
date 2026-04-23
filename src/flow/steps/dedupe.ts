// pattern: Functional Core

import type { Repo, RepoIdentity, RepoStep } from "../types.ts"

function defaultIdentity(repo: Repo): string {
	return repo.url.toString()
}

export function createDedupeStep(identity: RepoIdentity = defaultIdentity): RepoStep<Repo, Repo> {
	return {
		name: "dedupe",
		async *run(input, ctx) {
			for await (const repo of input) {
				const key = identity(repo)
				if (ctx.dedupe.has(key)) continue
				ctx.dedupe.add(key)
				yield repo
			}
		},
	}
}
