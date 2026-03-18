import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { urlExists } from "../util.ts"

// TODO: The generic provider uses a simple HEAD request which is loose —
// a 200 doesn't prove this is a git repository. Future improvements:
// - Try `git ls-remote` to confirm it's actually a git endpoint
// - Check for /.git/ or forge-specific markers
// - Look for common forge response headers
export const genericProvider: Repo = {
	name: "generic",

	async resolve(url: URL, signal: AbortSignal): Promise<RepoContext | undefined> {
		const segments = url.pathname.split("/").filter(Boolean)

		for (let length = segments.length; length >= 1; length--) {
			const candidate = segments.slice(0, length).join("/")
			const candidateUrl = `https://${url.host}/${candidate}`
			const exists = await urlExists(candidateUrl, signal)
			if (!exists) continue

			const ctx = new DefaultRepoContext()
			ctx.url = new URL(candidateUrl)
			return ctx
		}

		return undefined
	},
}
