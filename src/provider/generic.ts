// pattern: Imperative Shell

import { REPO_STATE, type Repo } from "../flow/types.ts"
import { isSsh, isUrl, looksLikeHost, normalizeInput, parseSsh, parseUrl } from "../repo/parse.ts"
import { urlExists } from "../repo/util.ts"
import type { Provider } from "./types.ts"

function buildRepo(
	input: string,
	host: string,
	org: string,
	project: string,
): Repo {
	const url = new URL(`https://${host}/${org}/${project}`)
	return {
		id: `generic:${input}:${url.toString()}`,
		input,
		url,
		inputUrl: new URL(url.toString()),
		host,
		org,
		project,
		state: REPO_STATE.candidate,
		producedBy: "generic",
		verifiedBy: new Set<string>(),
	}
}

export const genericProvider: Provider = {
	name: "generic",
	hosts: [],

	async *candidates(input: string): AsyncGenerator<Repo> {
		const { trimmed, segments } = normalizeInput(input)

		if (isSsh(trimmed)) {
			const parsed = parseSsh(trimmed)
			if (!parsed) return
			const parts = parsed.path.split("/").filter(Boolean)
			if (parts.length < 2) return
			const org = parts.slice(0, -1).join("/")
			const project = parts.at(-1)
			if (!project) return
			yield buildRepo(input, parsed.host, org, project)
			return
		}

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (!parsed) return
			const urlSegments = parsed.pathname.split("/").filter(Boolean)
			if (urlSegments.length < 2) return
			const org = urlSegments.slice(0, -1).join("/")
			const project = urlSegments.at(-1)
			if (!project) return
			yield buildRepo(input, parsed.host, org, project)
			return
		}

		if (segments.length >= 2 && looksLikeHost(segments[0]!)) {
			const host = segments[0]!
			const rest = segments.slice(1)
			const org = rest.slice(0, -1).join("/")
			const project = rest.at(-1)
			if (!project) return
			yield buildRepo(input, host, org, project)
		}
	},

	async verify(repo: Repo, signal: AbortSignal): Promise<Repo | null> {
		const segments = repo.url.pathname.split("/").filter(Boolean)
		for (let length = segments.length; length >= 1; length--) {
			const candidate = segments.slice(0, length).join("/")
			const candidateUrl = `https://${repo.url.host}/${candidate}`
			const exists = await urlExists(candidateUrl, signal)
			if (!exists) continue

			const url = new URL(candidateUrl)
			const parts = url.pathname.split("/").filter(Boolean)
			const org = parts.slice(0, -1).join("/")
			const project = parts.at(-1)
			if (!project) return null

			return {
				...repo,
				url,
				host: url.host,
				org,
				project,
				state: REPO_STATE.verified,
			}
		}

		return null
	},
}
