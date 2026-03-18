import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"

export const githubProvider: Repo = {
	name: "github",

	async resolve(url: URL, signal: AbortSignal): Promise<RepoContext | undefined> {
		const segments = url.pathname.split("/").filter(Boolean)
		if (segments.length < 2) return undefined

		const owner = segments[0]
		const repo = segments[1]

		const base = url.host === "github.com"
			? "https://api.github.com"
			: `https://${url.host}/api/v3`

		const response = await fetch(`${base}/repos/${owner}/${repo}`, {
			method: "GET",
			headers: { "user-agent": "rekon-dl" },
			signal,
		}).catch(() => null)

		if (!response || !response.ok) return undefined

		const ctx = new DefaultRepoContext()
		ctx.url = new URL(`https://${url.host}/${owner}/${repo}`)
		return ctx
	},

	resolveWiki(ctx: RepoContext): void {
		if (!ctx.url) return
		ctx.wikiGitUrl = new URL(`${ctx.url.toString()}.wiki.git`)
	},

	resolveDeepwiki(ctx: RepoContext): void {
		if (!ctx.project || !ctx.org) return
		ctx.deepwikiUrl = new URL(`https://deepwiki.com/${ctx.org}/${ctx.project}`)
	},
}
