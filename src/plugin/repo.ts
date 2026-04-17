import { plugin } from "gunshi/plugin"
import type { RepoContext } from "../repo/context.ts"
import { createRegistry } from "../repo/registry.ts"
import { collectCandidates, verifyCandidates, enrich } from "../repo/resolve.ts"
import { githubProvider } from "../repo/provider/github.ts"
import { gitlabProvider } from "../repo/provider/gitlab.ts"
import { tangledProvider } from "../repo/provider/tangled.ts"
import { cratesIoProvider } from "../repo/provider/crates-io.ts"
import { docsRsProvider } from "../repo/provider/docs-rs.ts"
import { genericProvider } from "../repo/provider/generic.ts"
import { npmxDevProvider } from "../repo/provider/npmx-dev.ts"
import { RESOLVE_TIMEOUT } from "../repo/util.ts"

export const REPO_PLUGIN_ID = "rekon:repo" as const

export interface RepoExtension {
	candidates: (input: string) => AsyncGenerator<RepoContext>
	resolve: (input: string) => AsyncGenerator<RepoContext>
}

export const repoPlugin = plugin({
	id: REPO_PLUGIN_ID,
	name: "Rekon Repository",
	extension: (): RepoExtension => {
		const registry = createRegistry(genericProvider)
		registry.register(githubProvider)
		registry.register(gitlabProvider)
		registry.register(tangledProvider)
		registry.register(cratesIoProvider)
		registry.register(docsRsProvider)
		registry.register(npmxDevProvider)

		return {
			async *candidates(input: string) {
				yield* collectCandidates(input, registry)
			},
			async *resolve(input: string) {
				const signal = AbortSignal.timeout(RESOLVE_TIMEOUT)
				const candidates = collectCandidates(input, registry)
				const verified = verifyCandidates(candidates, registry, signal)
				for await (const ctx of verified) {
					enrich(ctx, registry)
					yield ctx
				}
			},
		}
	},
})
