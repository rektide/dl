import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, isSsh, parseUrl } from "../parse.ts"

export const tangledProvider: Repo = {
	name: "tangled",
	hosts: ["tangled.org"],

	candidates(input: string): RepoContext[] {
		const { trimmed, path, segments } = normalizeInput(input)
		const results: RepoContext[] = []

		if (isSsh(trimmed)) return results

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "tangled.org" && segments.length >= 2) {
				const ctx = new DefaultRepoContext()
				ctx.url = new URL(`https://tangled.org/${segments.slice(0, 2).join("/")}`)
				ctx.source.provider = "tangled"
				results.push(ctx)
			}
			return results
		}

		if (segments.length >= 2 && segments[0] === "tangled.org") {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://tangled.org/${segments.slice(1, 3).join("/")}`)
			ctx.source.provider = "tangled"
			results.push(ctx)
			return results
		}

		if (segments.length >= 2) {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://tangled.org/${path}`)
			ctx.source.provider = "tangled"
			results.push(ctx)
		}

		return results
	},

	async verify(ctx: RepoContext, signal: AbortSignal): Promise<RepoContext | undefined> {
		if (!ctx.url) return undefined
		const segments = ctx.url.pathname.split("/").filter(Boolean)
		if (segments.length < 2) return undefined

		const repoPath = segments.slice(0, 2).join("/")

		const response = await fetch(`https://tangled.org/${repoPath}`, {
			method: "GET",
			signal,
		}).catch(() => null)

		if (!response || !response.ok) return undefined

		ctx.url = new URL(`https://tangled.org/${repoPath}`)
		ctx.verified = true
		return ctx
	},
}
