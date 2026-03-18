import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"

export const gitlabProvider: Repo = {
	name: "gitlab",

	async resolve(url: URL, signal: AbortSignal): Promise<RepoContext | undefined> {
		const segments = url.pathname.split("/").filter(Boolean)
		if (segments.length < 2) return undefined

		for (let length = segments.length; length >= 2; length--) {
			const candidate = segments.slice(0, length).join("/")
			const encodedPath = encodeURIComponent(candidate)
			const response = await fetch(
				`https://${url.host}/api/v4/projects/${encodedPath}`,
				{
					method: "GET",
					headers: { "user-agent": "rekon-dl" },
					signal,
				},
			).catch(() => null)

			if (!response || !response.ok) continue

			const body = (await response.json()) as {
				path_with_namespace?: string
			}
			const namespacePath = body.path_with_namespace ?? candidate

			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://${url.host}/${namespacePath}`)
			return ctx
		}

		return undefined
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
