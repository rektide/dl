import { plugin } from "gunshi/plugin"
import type { RepoContext } from "../repo/context.ts"
import { expand, sshExpander, urlExpander, hostPathExpander, createShorthandExpander } from "../url/index.ts"
import { createRegistry } from "../repo/registry.ts"
import { verify, enrich } from "../repo/resolve.ts"
import { githubProvider } from "../repo/provider/github.ts"
import { gitlabProvider } from "../repo/provider/gitlab.ts"
import { tangledProvider } from "../repo/provider/tangled.ts"
import { cratesIoProvider, docsRsProvider } from "../repo/provider/crates-io.ts"
import { genericProvider } from "../repo/provider/generic.ts"
import { npmxDevProvider } from "../repo/provider/npmx-dev.ts"
import { RESOLVE_TIMEOUT } from "../repo/util.ts"

export const REPO_PLUGIN_ID = "rekon:repo" as const

export interface RepoExtension {
	resolve: (input: string) => AsyncGenerator<RepoContext>
}

export function createRepoPlugin(options?: {
	defaultHosts?: string[]
}) {
	return plugin({
		id: REPO_PLUGIN_ID,
		name: "Rekon Repository",
		extension: (): RepoExtension => {
			const registry = createRegistry(genericProvider)
			registry.register(githubProvider, ["github.com"])
			registry.register(gitlabProvider, ["gitlab.com"])
			registry.register(tangledProvider, ["tangled.org", "tangled.sh", "tangled.com"])
			registry.register(cratesIoProvider, ["crates.io"])
			registry.register(docsRsProvider, ["docs.rs"])
			registry.register(npmxDevProvider, ["npmx.dev", "npmjs.com"])

			const expanders = [
				sshExpander,
				urlExpander,
				hostPathExpander,
				createShorthandExpander({
					defaultHosts: options?.defaultHosts ?? registry.knownHosts(),
				}),
			]

			return {
				async *resolve(input: string) {
					const signal = AbortSignal.timeout(RESOLVE_TIMEOUT)
					const candidates = expand(input, expanders)
					for await (const ctx of verify(input, candidates, registry, signal)) {
						enrich(ctx, registry)
						yield ctx
					}
				},
			}
		},
	})
}
