// pattern: Imperative Shell

import { REPO_STATE, type Repo } from "../flow/types.ts"
import { HostProvider, type PathSplit } from "./host.ts"

export class TangledProvider extends HostProvider {
	name = "tangled"
	hosts = ["tangled.org"] as const

	get supportsSsh(): boolean {
		return false
	}

	splitPath(segments: ReadonlyArray<string>): PathSplit | null {
		if (segments.length < 2) return null
		return { org: segments[0]!, project: segments[1]! }
	}

	async verify(repo: Repo, signal: AbortSignal): Promise<Repo | null> {
		if (!repo.org || !repo.project) return null

		const response = await fetch(
			`https://tangled.org/${repo.org}/${repo.project}`,
			{
				method: "GET",
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

export const tangledProvider = new TangledProvider()
