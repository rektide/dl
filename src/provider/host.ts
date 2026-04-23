// pattern: Functional Core

import { REPO_STATE, type Repo } from "../flow/types.ts"
import type { Provider } from "./types.ts"
import { isSsh, isUrl, normalizeInput, parseSsh, parseUrl } from "../repo/parse.ts"

export type PathSplit = {
	org: string
	project: string
}

function buildRepoId(providerName: string, input: string, url: URL): string {
	return `${providerName}:${input}:${url.toString()}`
}

export abstract class HostProvider implements Provider {
	abstract name: string
	abstract hosts: ReadonlyArray<string>

	abstract splitPath(segments: ReadonlyArray<string>): PathSplit | null
	abstract verify(repo: Repo, signal: AbortSignal): Promise<Repo | null>

	get supportsSsh(): boolean {
		return true
	}

	async *candidates(input: string): AsyncGenerator<Repo> {
		const { trimmed, segments } = normalizeInput(input)

		if (isSsh(trimmed)) {
			if (!this.supportsSsh) return
			const parsed = parseSsh(trimmed)
			if (!parsed || !this.isMyHost(parsed.host)) return
			const parts = parsed.path.split("/").filter(Boolean)
			if (parts.length < 2) return
			const split = this.splitPath(parts)
			if (!split) return
			yield this.buildRepo(input, split)
			return
		}

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (!parsed || !this.isMyHost(parsed.host)) return
			const urlSegments = parsed.pathname.split("/").filter(Boolean)
			if (urlSegments.length < 2) return
			const split = this.splitPath(urlSegments)
			if (!split) return
			yield this.buildRepo(input, split)
			return
		}

		if (segments.length >= 2 && this.isMyHost(segments[0]!)) {
			const rest = segments.slice(1)
			const split = this.splitPath(rest)
			if (!split) return
			yield this.buildRepo(input, split)
			return
		}

		if (segments.length >= 2 && !segments[0]!.includes(".")) {
			const split = this.splitPath(segments)
			if (!split) return
			yield this.buildRepo(input, split)
		}
	}

	protected isMyHost(host: string): boolean {
		return this.hosts.includes(host)
	}

	protected buildRepo(input: string, split: PathSplit): Repo {
		const url = new URL(`https://${this.hosts[0]}/${split.org}/${split.project}`)
		return {
			id: buildRepoId(this.name, input, url),
			input,
			url,
			inputUrl: new URL(url.toString()),
			host: this.hosts[0] ?? null,
			org: split.org,
			project: split.project,
			state: REPO_STATE.candidate,
			producedBy: this.name,
			verifiedBy: new Set<string>(),
		}
	}
}
