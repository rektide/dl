import { plugin } from "gunshi/plugin"
import {
	parseInput,
	resolveRepository,
} from "../dl/repository.ts"
import type { ParsedInput } from "../dl/provider.ts"
import type { RepoContext } from "../dl/types.ts"

export const REPO_PLUGIN_ID = "rekon:repo" as const

export interface RepoExtension {
	parse: (input: string) => ParsedInput
	resolve: (input: string) => Promise<RepoContext>
}

export function createRepoPlugin() {
	return plugin({
		id: REPO_PLUGIN_ID,
		name: "Rekon Repository",
		extension: (): RepoExtension => ({
			parse: (input) => parseInput(input),
			resolve: (input) => resolveRepository(input),
		}),
	})
}
