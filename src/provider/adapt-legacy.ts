// pattern: Imperative Shell

import { DefaultRepoContext } from "../repo/context.ts"
import type { RepoContext } from "../repo/context.ts"
import type { Repo as LegacyProvider } from "../repo/types.ts"
import { REPO_STATE, type Repo } from "../flow/types.ts"
import type { Provider } from "./types.ts"

function cloneUrl(url: URL | undefined): URL | null {
	if (!url) return null
	return new URL(url.toString())
}

function makeRepoId(input: string, url: URL, providerName: string): string {
	return `${providerName}:${input}:${url.toString()}`
}

function contextToRepo(ctx: RepoContext, input: string, providerName: string): Repo | null {
	const url = cloneUrl(ctx.url)
	if (!url) return null

	const producedBy = ctx.source.provider ?? providerName
	const state = ctx.verified ? REPO_STATE.verified : REPO_STATE.candidate
	const verifiedBy = ctx.verified
		? new Set<string>([providerName])
		: new Set<string>()

	return {
		id: makeRepoId(input, url, producedBy),
		input,
		url,
		inputUrl: cloneUrl(ctx.inputUrl) ?? url,
		host: ctx.host ?? url.host,
		org: ctx.org ?? null,
		project: ctx.project ?? null,
		state,
		producedBy,
		verifiedBy,
	}
}

function repoToContext(repo: Repo): RepoContext {
	const ctx = new DefaultRepoContext()
	ctx.input = repo.input
	ctx.host = repo.host ?? undefined
	ctx.org = repo.org ?? undefined
	ctx.project = repo.project ?? undefined
	ctx.url = new URL(repo.url.toString())
	ctx.inputUrl = repo.inputUrl ? new URL(repo.inputUrl.toString()) : undefined
	ctx.verified = repo.state === REPO_STATE.verified
	ctx.source.provider = repo.producedBy
	return ctx
}

export function adaptLegacyProvider(legacy: LegacyProvider): Provider {
	return {
		name: legacy.name,
		hosts: [...legacy.hosts],
		async *candidates(input: string): AsyncGenerator<Repo> {
			for await (const candidate of legacy.candidates(input)) {
				const repo = contextToRepo(candidate, input, legacy.name)
				if (!repo) continue
				yield repo
			}
		},
		async verify(repo: Repo, signal: AbortSignal): Promise<Repo | null> {
			const candidateContext = repoToContext(repo)
			for await (const verified of legacy.verify(candidateContext, signal)) {
				const normalized = contextToRepo(verified, repo.input, legacy.name)
				if (!normalized) continue
				return normalized
			}
			return null
		},
	}
}
