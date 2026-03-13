import { plugin } from "gunshi/plugin"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"

export const GIT_PLUGIN_ID = "rekon:git" as const

export interface GitExtension extends GitOps {}

export function createGitPlugin() {
	return plugin({
		id: GIT_PLUGIN_ID,
		name: "Rekon Git",
		extension: (): GitExtension => defaultGitOps,
	})
}
