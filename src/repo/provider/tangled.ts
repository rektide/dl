import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, isSsh, parseUrl } from "../parse.ts"

export const tangledProvider: Repo = {
	name: "tangled",
	hosts: ["tangled.org"],

	toUrlString(ctx: RepoContext): string | undefined {
		if (!ctx.org || !ctx.project) return undefined
		return `https://tangled.org/${ctx.org}/${ctx.project}`
	},

	async *candidates(input: string): AsyncGenerator<RepoContext> {
		const { trimmed, path, segments } = normalizeInput(input)

		if (isSsh(trimmed)) return

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "tangled.org" && segments.length >= 2) {
				const ctx = new DefaultRepoContext()
				ctx.org = segments[0]
				ctx.project = segments[1]
				ctx.host = "tangled.org"
				ctx.url = new URL(this.toUrlString(ctx)!)
				ctx.source.provider = "tangled"
				yield ctx
			}
			return
		}

		if (segments.length >= 2 && segments[0] === "tangled.org") {
			const ctx = new DefaultRepoContext()
			ctx.org = segments[1]
			ctx.project = segments[2]
			ctx.host = "tangled.org"
			ctx.url = new URL(this.toUrlString(ctx)!)
			ctx.source.provider = "tangled"
			yield ctx
			return
		}

		if (segments.length >= 2) {
			const ctx = new DefaultRepoContext()
			ctx.org = segments[0]
			ctx.project = segments[1]
			ctx.host = "tangled.org"
			ctx.url = new URL(this.toUrlString(ctx)!)
			ctx.source.provider = "tangled"
			yield ctx
		}
	},

	async *verify(ctx: RepoContext, signal: AbortSignal): AsyncGenerator<RepoContext> {
		if (!ctx.org || !ctx.project) return

		const response = await fetch(`https://tangled.org/${ctx.org}/${ctx.project}`, {
			method: "GET",
			signal,
		}).catch(() => null)

		if (!response || !response.ok) return

		ctx.verified = true
		yield ctx
	},
}
