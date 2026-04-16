import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, isSsh, parseSsh, parseUrl } from "../parse.ts"

export const gitlabProvider: Repo = {
	name: "gitlab",
	hosts: ["gitlab.com"],

	toUrlString(ctx: RepoContext): string | undefined {
		if (!ctx.org || !ctx.project) return undefined
		return `https://gitlab.com/${ctx.org}/${ctx.project}`
	},

	async *candidates(input: string): AsyncGenerator<RepoContext> {
		const { trimmed, path, segments } = normalizeInput(input)

		if (isSsh(trimmed)) {
			const parsed = parseSsh(trimmed)
			if (parsed && parsed.host === "gitlab.com") {
				const parts = parsed.path.split("/").filter(Boolean)
				if (parts.length >= 2) {
					const ctx = new DefaultRepoContext()
					ctx.org = parts.slice(0, -1).join("/")
					ctx.project = parts.at(-1)
					ctx.host = "gitlab.com"
					ctx.url = new URL(this.toUrlString(ctx)!)
					ctx.source.provider = "gitlab"
					yield ctx
				}
			}
			return
		}

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "gitlab.com") {
				const urlSegments = parsed.pathname.split("/").filter(Boolean)
				if (urlSegments.length >= 2) {
					const ctx = new DefaultRepoContext()
					ctx.org = urlSegments.slice(0, -1).join("/")
					ctx.project = urlSegments.at(-1)
					ctx.host = "gitlab.com"
					ctx.url = new URL(this.toUrlString(ctx)!)
					ctx.source.provider = "gitlab"
					yield ctx
				}
			}
			return
		}

		if (segments.length >= 2 && segments[0] === "gitlab.com") {
			const rest = segments.slice(1)
			const ctx = new DefaultRepoContext()
			ctx.org = rest.slice(0, -1).join("/")
			ctx.project = rest.at(-1)
			ctx.host = "gitlab.com"
			ctx.url = new URL(this.toUrlString(ctx)!)
			ctx.source.provider = "gitlab"
			yield ctx
			return
		}

		if (segments.length >= 2 && !segments[0]!.includes(".")) {
			const ctx = new DefaultRepoContext()
			ctx.org = segments.slice(0, -1).join("/")
			ctx.project = segments.at(-1)
			ctx.host = "gitlab.com"
			ctx.url = new URL(this.toUrlString(ctx)!)
			ctx.source.provider = "gitlab"
			yield ctx
		}
	},

	async *verify(ctx: RepoContext, signal: AbortSignal): AsyncGenerator<RepoContext> {
		if (!ctx.org || !ctx.project) return

		const fullPath = `${ctx.org}/${ctx.project}`
		const segments = fullPath.split("/")

		for (let length = segments.length; length >= 2; length--) {
			const candidate = segments.slice(0, length).join("/")
			const encodedPath = encodeURIComponent(candidate)
			const response = await fetch(
				`https://gitlab.com/api/v4/projects/${encodedPath}`,
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
			const resolvedPath = body.path_with_namespace ?? candidate
			const parts = resolvedPath.split("/")

			ctx.org = parts.slice(0, -1).join("/")
			ctx.project = parts.at(-1)
			ctx.host = "gitlab.com"
			ctx.url = new URL(this.toUrlString(ctx)!)
			ctx.verified = true
			yield ctx
			return
		}
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
