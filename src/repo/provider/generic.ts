import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, isSsh, looksLikeHost, parseSsh, parseUrl } from "../parse.ts"
import { urlExists } from "../util.ts"

export const genericProvider: Repo = {
	name: "generic",
	hosts: [],

	candidates(input: string): RepoContext[] {
		const { trimmed, path, segments } = normalizeInput(input)
		const results: RepoContext[] = []

		if (isSsh(trimmed)) {
			const parsed = parseSsh(trimmed)
			if (parsed) {
				const ctx = new DefaultRepoContext()
				ctx.url = new URL(`https://${parsed.host}/${parsed.path}`)
				ctx.source.provider = "generic"
				results.push(ctx)
			}
			return results
		}

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && segments.length >= 2) {
				const ctx = new DefaultRepoContext()
				ctx.url = parsed
				ctx.source.provider = "generic"
				results.push(ctx)
			}
			return results
		}

		if (segments.length >= 2 && looksLikeHost(segments[0]!)) {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://${path}`)
			ctx.source.provider = "generic"
			results.push(ctx)
		}

		return results
	},

	async verify(ctx: RepoContext, signal: AbortSignal): Promise<RepoContext | undefined> {
		if (!ctx.url) return undefined
		const segments = ctx.url.pathname.split("/").filter(Boolean)

		for (let length = segments.length; length >= 1; length--) {
			const candidate = segments.slice(0, length).join("/")
			const candidateUrl = `https://${ctx.url.host}/${candidate}`
			const exists = await urlExists(candidateUrl, signal)
			if (!exists) continue

			ctx.url = new URL(candidateUrl)
			ctx.verified = true
			return ctx
		}

		return undefined
	},
}
