// pattern: Imperative Shell

import { REPO_STATE, type Repo } from "../flow/types.ts"
import { HostProvider, type PathSplit } from "./host.ts"
import type { OrgRepo, BrowseProvider } from "./browse.ts"

type GithubApiRepo = {
	name: string
	full_name: string
	description?: string
	pushed_at?: string
	stargazers_count?: number
	fork?: boolean
	html_url: string
}

export class GithubProvider extends HostProvider implements BrowseProvider {
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

	async *browseOrg(org: string, signal: AbortSignal): AsyncIterable<OrgRepo> {
		let page = 1
		const perPage = 100

		while (true) {
			const url = `https://api.github.com/orgs/${org}/repos?per_page=${perPage}&page=${page}&sort=updated&direction=desc`
			const response = await fetch(url, {
				method: "GET",
				headers: { "user-agent": "rekon-dl" },
				signal,
			})

			if (!response.ok) {
				if (response.status === 404) return
				throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
			}

			const repos = (await response.json()) as GithubApiRepo[]
			if (repos.length === 0) return

			for (const repo of repos) {
				yield {
					name: repo.name,
					fullName: repo.full_name,
					description: repo.description,
					updatedAt: repo.pushed_at ? new Date(repo.pushed_at) : new Date(0),
					stars: repo.stargazers_count,
					isFork: repo.fork,
					url: new URL(repo.html_url),
				}
			}

			const linkHeader = response.headers.get("link")
			if (!linkHeader?.includes('rel="next"')) return
			page++
		}
	}
}

export const githubProvider = new GithubProvider()
