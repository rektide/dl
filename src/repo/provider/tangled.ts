import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"

export const tangledProvider: Repo = {
	name: "tangled",

	async resolve(url: URL, signal: AbortSignal): Promise<RepoContext | undefined> {
		const segments = url.pathname.split("/").filter(Boolean)
		if (segments.length < 2) return undefined

		const repoPath = segments.slice(0, 2).join("/")

		const response = await fetch(`https://${url.host}/${repoPath}`, {
			method: "GET",
			signal,
		}).catch(() => null)

		if (!response) return undefined
		if (!response.ok) return undefined

		const ctx = new DefaultRepoContext()
		ctx.url = new URL(`https://${url.host}/${repoPath}`)
		return ctx
	},
}
