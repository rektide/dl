import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, isSsh, parseSsh, parseUrl } from "../parse.ts"

export const githubProvider: Repo = {
	name: "github",
	hosts: ["github.com"],

	toUrlString(ctx: RepoContext): string | undefined {
		if (!ctx.org || !ctx.project) return undefined
		return `https://github.com/${ctx.org}/${ctx.project}`
	},

	async *candidates(input: string): AsyncGenerator<RepoContext> {
		const { trimmed, path, segments } = normalizeInput(input)

		if (isSsh(trimmed)) {
			const parsed = parseSsh(trimmed)
			if (parsed && parsed.host === "github.com") {
				const parts = parsed.path.split("/").filter(Boolean)
				if (parts.length >= 2) {
					const ctx = new DefaultRepoContext()
					ctx.org = parts.slice(0, -1).join("/")
					ctx.project = parts.at(-1)
					ctx.host = "github.com"
					ctx.url = new URL(this.toUrlString(ctx)!)
					ctx.source.provider = "github"
					yield ctx
				}
			}
			return
		}

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "github.com") {
				const urlSegments = parsed.pathname.split("/").filter(Boolean)
				if (urlSegments.length >= 2) {
					const ctx = new DefaultRepoContext()
					ctx.org = urlSegments[0]
					ctx.project = urlSegments[1]
					ctx.host = "github.com"
					ctx.url = new URL(this.toUrlString(ctx)!)
					ctx.source.provider = "github"
					yield ctx
				}
			}
			return
		}

		if (segments.length >= 2 && segments[0] === "github.com") {
			const ctx = new DefaultRepoContext()
			ctx.org = segments[1]
			ctx.project = segments[2]
			ctx.host = "github.com"
			ctx.url = new URL(this.toUrlString(ctx)!)
			ctx.source.provider = "github"
			yield ctx
			return
		}

		if (segments.length >= 2 && !segments[0]!.includes(".")) {
			const ctx = new DefaultRepoContext()
			ctx.org = segments[0]
			ctx.project = segments[1]
			ctx.host = "github.com"
			ctx.url = new URL(this.toUrlString(ctx)!)
			ctx.source.provider = "github"
			yield ctx
		}
	},

	async *verify(ctx: RepoContext, signal: AbortSignal): AsyncGenerator<RepoContext> {
		if (!ctx.org || !ctx.project) return

		const response = await fetch(`https://api.github.com/repos/${ctx.org}/${ctx.project}`, {
			method: "GET",
			headers: { "user-agent": "rekon-dl" },
			signal,
		}).catch(() => null)

		if (!response || !response.ok) return

		ctx.verified = true
		yield ctx
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
