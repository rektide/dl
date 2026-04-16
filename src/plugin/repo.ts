import { plugin } from "gunshi/plugin"
import type { RepoContext } from "../repo/context.ts"
import { createRegistry } from "../repo/registry.ts"
import { collectCandidates, verify, enrich } from "../repo/resolve.ts"
import { githubProvider } from "../repo/provider/github.ts"
import { gitlabProvider } from "../repo/provider/gitlab.ts"
import { tangledProvider } from "../repo/provider/tangled.ts"
import { cratesIoProvider, docsRsProvider } from "../repo/provider/crates-io.ts"
import { genericProvider } from "../repo/provider/generic.ts"
import { npmxDevProvider } from "../repo/provider/npmx-dev.ts"
import { RESOLVE_TIMEOUT } from "../repo/util.ts"

export const REPO_PLUGIN_ID = "rekon:repo" as const

export interface RepoExtension {
	candidates: (input: string) => RepoContext[]
	resolve: (input: string) => AsyncGenerator<RepoContext>
}

export function createRepoPlugin() {
	return plugin({
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
				candidates(input: string): RepoContext[] {
					return collectCandidates(input, registry)
				},
				async *resolve(input: string) {
					const signal = AbortSignal.timeout(RESOLVE_TIMEOUT)
					for await (const ctx of verify(input, registry, signal)) {
						enrich(ctx, registry)
						yield ctx
					}
				},
			}
		},
	})
}
