import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, isSsh, looksLikeHost, parseSsh, parseUrl } from "../parse.ts"
import { urlExists } from "../util.ts"

/**
 * Generic catch-all provider — no host binding, verifies by probing URLs.
 * Used as the fallback when no host-specific provider matches.
 */
export const genericProvider: Repo = {
	name: "generic",
	hosts: [],

	toUrlString(ctx: RepoContext): string | undefined {
		if (!ctx.host || !ctx.org || !ctx.project) return undefined
		return `https://${ctx.host}/${ctx.org}/${ctx.project}`
	},

	async *candidates(input: string): AsyncGenerator<RepoContext> {
		const { trimmed, segments } = normalizeInput(input)

		if (isSsh(trimmed)) {
			const parsed = parseSsh(trimmed)
			if (parsed) {
				const parts = parsed.path.split("/").filter(Boolean)
				if (parts.length >= 2) {
					const ctx = new DefaultRepoContext()
					ctx.host = parsed.host
					ctx.org = parts.slice(0, -1).join("/")
					ctx.project = parts.at(-1)
					ctx.url = new URL(this.toUrlString(ctx)!)
					ctx.source.provider = "generic"
					yield ctx
				}
			}
			return
		}

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed) {
				const urlSegments = parsed.pathname
					.split("/")
					.filter(Boolean)
				if (urlSegments.length >= 2) {
					const ctx = new DefaultRepoContext()
					ctx.host = parsed.host
					ctx.org = urlSegments.slice(0, -1).join("/")
					ctx.project = urlSegments.at(-1)
					ctx.url = new URL(this.toUrlString(ctx)!)
					ctx.source.provider = "generic"
					yield ctx
				}
			}
			return
		}

		if (
			segments.length >= 2 &&
			looksLikeHost(segments[0]!)
		) {
			const rest = segments.slice(1)
			const ctx = new DefaultRepoContext()
			ctx.host = segments[0]
			ctx.org = rest.slice(0, -1).join("/")
			ctx.project = rest.at(-1)
			ctx.url = new URL(this.toUrlString(ctx)!)
			ctx.source.provider = "generic"
			yield ctx
		}
	},

	async *verify(
		ctx: RepoContext,
		signal: AbortSignal,
	): AsyncGenerator<RepoContext> {
		if (!ctx.url) return

		const segments = ctx.url.pathname.split("/").filter(Boolean)
		for (let length = segments.length; length >= 1; length--) {
			const candidate = segments.slice(0, length).join("/")
			const candidateUrl = `https://${ctx.url.host}/${candidate}`
			const exists = await urlExists(candidateUrl, signal)
			if (!exists) continue

			ctx.url = new URL(candidateUrl)
			ctx.verified = true
			yield ctx
			return
		}
	},
}
