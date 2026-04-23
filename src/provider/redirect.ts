// pattern: Imperative Shell

import { cleanRepoUrl, type CleanUrlOptions, ALL_CLEAN } from "../repo/clean-url.ts"
import { REPO_STATE, type Repo } from "../flow/types.ts"
import type { Provider } from "./types.ts"

function buildRepoId(providerName: string, input: string, url: URL): string {
	return `${providerName}:${input}:${url.toString()}`
}

function repoFromUrl(input: string, providerName: string, url: URL): Repo | null {
	const pathSegments = url.pathname.split("/").filter(Boolean)
	if (pathSegments.length < 2) return null

	const org = pathSegments.slice(0, -1).join("/")
	const project = pathSegments.at(-1) ?? null
	if (!project) return null

	const canonical = new URL(`https://${url.host}/${org}/${project}`)
	return {
		id: buildRepoId(providerName, input, canonical),
		input,
		url: canonical,
		inputUrl: new URL(canonical.toString()),
		host: canonical.host,
		org,
		project,
		state: REPO_STATE.candidate,
		producedBy: providerName,
		verifiedBy: new Set<string>(),
	}
}

export abstract class RedirectProvider implements Provider {
	abstract name: string
	abstract hosts: ReadonlyArray<string>

	abstract extractIdentifier(input: string): string | undefined
	abstract fetchRepoUrl(identifier: string, signal: AbortSignal): Promise<string | undefined>

	protected cleanRawUrl(raw: string, _options: CleanUrlOptions = ALL_CLEAN): string {
		return raw
	}

	async *candidates(input: string): AsyncGenerator<Repo> {
		const identifier = this.extractIdentifier(input)
		if (!identifier) return

		const signal = AbortSignal.timeout(8_000)
		const raw = await this.fetchRepoUrl(identifier, signal).catch(() => undefined)
		if (!raw) return

		const cleaned = this.cleanRawUrl(raw)
		const parsed = cleanRepoUrl(cleaned)
		if (!parsed) return

		const repo = repoFromUrl(input, this.name, parsed)
		if (!repo) return

		yield repo
	}

	async verify(_repo: Repo, _signal: AbortSignal): Promise<Repo | null> {
		return null
	}
}
