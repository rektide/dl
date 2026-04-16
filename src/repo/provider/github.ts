import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, isSsh, parseSsh, parseUrl } from "../parse.ts"

export const githubProvider: Repo = {
	name: "github",
	hosts: ["github.com"],

	candidates(input: string): RepoContext[] {
		const { trimmed, path, segments } = normalizeInput(input)
		const results: RepoContext[] = []

		if (isSsh(trimmed)) {
			const parsed = parseSsh(trimmed)
			if (parsed && parsed.host === "github.com") {
				const ctx = new DefaultRepoContext()
				ctx.url = new URL(`https://github.com/${parsed.path}`)
				ctx.source.provider = "github"
				results.push(ctx)
			}
			return results
		}

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "github.com" && segments.length >= 2) {
				const ctx = new DefaultRepoContext()
				ctx.url = new URL(`https://github.com/${segments.slice(0, 2).join("/")}`)
				ctx.source.provider = "github"
				results.push(ctx)
			}
			return results
		}

		if (segments.length >= 2 && segments[0] === "github.com") {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://github.com/${segments.slice(1, 3).join("/")}`)
			ctx.source.provider = "github"
			results.push(ctx)
			return results
		}

		if (segments.length >= 2 && !segments[0]!.includes(".")) {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://github.com/${path}`)
			ctx.source.provider = "github"
			results.push(ctx)
		}

		return results
	},

	async verify(ctx: RepoContext, signal: AbortSignal): Promise<RepoContext | undefined> {
		if (!ctx.url) return undefined
		const segments = ctx.url.pathname.split("/").filter(Boolean)
		if (segments.length < 2) return undefined

		const owner = segments[0]
		const repo = segments[1]

		const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
			method: "GET",
			headers: { "user-agent": "rekon-dl" },
			signal,
		}).catch(() => null)

		if (!response || !response.ok) return undefined

		ctx.url = new URL(`https://github.com/${owner}/${repo}`)
		ctx.verified = true
		return ctx
	},

	resolveWikiRepo(ctx: RepoContext): void {
		if (!ctx.url) return
		ctx.wikiRepoUrl = new URL(`${ctx.url.toString()}.wiki.git`)
	},

	resolveWikiDeep(ctx: RepoContext): void {
		if (!ctx.project || !ctx.org) return
		ctx.wikiDeepUrl = new URL(`https://deepwiki.com/${ctx.org}/${ctx.project}`)
	},
}
