// pattern: Imperative Shell

import { REPO_STATE, type Repo } from "../flow/types.ts"
import { HostProvider, type PathSplit } from "./host.ts"

export class GitlabProvider extends HostProvider {
	name = "gitlab"
	hosts = ["gitlab.com"] as const

	splitPath(segments: ReadonlyArray<string>): PathSplit | null {
		if (segments.length < 2) return null
		return {
			org: segments.slice(0, -1).join("/"),
			project: segments.at(-1)!,
		}
	}

	async verify(repo: Repo, signal: AbortSignal): Promise<Repo | null> {
		if (!repo.org || !repo.project) return null

		const fullPath = `${repo.org}/${repo.project}`
		const segments = fullPath.split("/")

		for (let length = segments.length; length >= 2; length--) {
			const candidate = segments.slice(0, length).join("/")
			const encodedPath = encodeURIComponent(candidate)
			const response = await fetch(
				`https://gitlab.com/api/v4/projects/${encodedPath}`,
				{
					method: "GET",
					headers: { "user-agent": "dl" },
					signal,
				},
			)

			if (!response.ok) continue

			const body = (await response.json()) as {
				path_with_namespace?: string
			}
			const resolvedPath = body.path_with_namespace ?? candidate
			const parts = resolvedPath.split("/")
			const org = parts.slice(0, -1).join("/")
			const project = parts.at(-1) ?? repo.project
			const url = new URL(`https://gitlab.com/${org}/${project}`)

			return {
				...repo,
				host: "gitlab.com",
				org,
				project,
				url,
				state: REPO_STATE.verified,
			}
		}

		return null
	}
}

export const gitlabProvider = new GitlabProvider()
