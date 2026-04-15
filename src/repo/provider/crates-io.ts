import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"

export const cratesIoProvider: Repo = {
	name: "crates-io",

	async resolve(url: URL, signal: AbortSignal): Promise<RepoContext | undefined> {
		const segments = url.pathname.split("/").filter(Boolean)
		if (segments[0] !== "crates" || segments.length < 2) return undefined

		const crateName = segments[1]
		const response = await fetch(`https://crates.io/api/v1/crates/${crateName}`, {
			method: "GET",
			headers: { "user-agent": "rekon-dl" },
			signal,
		}).catch(() => null)

		if (!response || !response.ok) return undefined

		const body = (await response.json()) as { crate?: { repository?: string } }
		const repoUrl = body.crate?.repository
		if (!repoUrl) return undefined

		try {
			const resolved = new URL(repoUrl)
			if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return undefined

			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://${resolved.host}${resolved.pathname.replace(/\.git$/, "")}`)
			return ctx
		} catch {
			return undefined
		}
	},
}
