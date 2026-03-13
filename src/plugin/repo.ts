import { plugin } from "gunshi/plugin"
import {
	parseRepositoryInput,
	resolveRepository,
} from "../dl/repository.ts"
import type {
	ParsedRepositoryInput,
	RepoContext,
} from "../dl/types.ts"

export const REPO_PLUGIN_ID = "rekon:repo" as const

export interface RepoExtension {
	parse: (input: string) => ParsedRepositoryInput
	resolve: (input: string) => Promise<RepoContext>
}

export function createRepoPlugin() {
	return plugin({
		id: REPO_PLUGIN_ID,
		name: "Rekon Repository",
		extension: (): RepoExtension => ({
			parse: (input) => parseRepositoryInput(input),
			resolve: (input) => resolveRepository(input),
		}),
	})
}
