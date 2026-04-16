import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, isSsh, parseSsh, parseUrl } from "../parse.ts"

export const gitlabProvider: Repo = {
	name: "gitlab",
	hosts: ["gitlab.com"],

	candidates(input: string): RepoContext[] {
		const { trimmed, path, segments } = normalizeInput(input)
		const results: RepoContext[] = []

		if (isSsh(trimmed)) {
			const parsed = parseSsh(trimmed)
			if (parsed && parsed.host === "gitlab.com") {
				const ctx = new DefaultRepoContext()
				ctx.url = new URL(`https://gitlab.com/${parsed.path}`)
				ctx.source.provider = "gitlab"
				results.push(ctx)
			}
			return results
		}

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "gitlab.com" && segments.length >= 2) {
				const ctx = new DefaultRepoContext()
				ctx.url = parsed
				ctx.source.provider = "gitlab"
				results.push(ctx)
			}
			return results
		}

		if (segments.length >= 2 && segments[0] === "gitlab.com") {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://gitlab.com/${segments.slice(1).join("/")}`)
			ctx.source.provider = "gitlab"
			results.push(ctx)
			return results
		}

		if (segments.length >= 2 && !segments[0]!.includes(".")) {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://gitlab.com/${path}`)
			ctx.source.provider = "gitlab"
			results.push(ctx)
		}

		return results
	},

	async verify(ctx: RepoContext, signal: AbortSignal): Promise<RepoContext | undefined> {
		if (!ctx.url) return undefined
		const segments = ctx.url.pathname.split("/").filter(Boolean)
		if (segments.length < 2) return undefined

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

			ctx.url = new URL(`https://gitlab.com/${resolvedPath}`)
			ctx.verified = true
			return ctx
		}

		return undefined
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
