// pattern: Imperative Shell

import { REPO_STATE, type Repo } from "../flow/types.ts"
import { HostProvider, type PathSplit } from "./host.ts"

export class GithubProvider extends HostProvider {
	name = "github"
	hosts = ["github.com"] as const

	splitPath(segments: ReadonlyArray<string>): PathSplit | null {
		if (segments.length < 2) return null
		return { org: segments[0]!, project: segments[1]! }
	}

	async verify(repo: Repo, signal: AbortSignal): Promise<Repo | null> {
		if (!repo.org || !repo.project) return null

		const response = await fetch(
			`https://api.github.com/repos/${repo.org}/${repo.project}`,
			{
				method: "GET",
				headers: { "user-agent": "rekon-dl" },
				signal,
			},
		)

		if (!response.ok) return null

		return {
			...repo,
			state: REPO_STATE.verified,
		}
	}
}

export const githubProvider = new GithubProvider()
