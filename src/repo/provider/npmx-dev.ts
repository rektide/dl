import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"

export const npmxDevProvider: Repo = {
	name: "npm-registry",

	async resolve(url: URL, signal: AbortSignal): Promise<RepoContext | undefined> {
		const segments = url.pathname.split("/").filter(Boolean)
		if (segments[0] !== "package" || segments.length < 2) return undefined

		let packageName: string
		if (segments[1]?.startsWith("@")) {
			if (segments.length < 3) return undefined
			packageName = `${segments[1]}/${segments[2]}`
		} else {
			packageName = segments[1]
		}
		const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
			method: "GET",
			headers: { "user-agent": "rekon-dl" },
			signal,
		}).catch(() => null)

		if (!response || !response.ok) return undefined

		const body = (await response.json()) as { repository?: { url?: string } }
		const repoUrl = body.repository?.url
		if (!repoUrl) return undefined

		const cleaned = repoUrl
			.replace(/^git\+/, "")
			.replace(/^git:\/\//, "https://")
			.replace(/^ssh:\/\/git@/, "https://")
			.replace(/\.git$/, "")

		try {
			const resolved = new URL(cleaned)
			if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return undefined

			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://${resolved.host}${resolved.pathname.replace(/\.git$/, "")}`)
			return ctx
		} catch {
			return undefined
		}
	},
}
