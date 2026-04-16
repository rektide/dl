import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, parseUrl } from "../parse.ts"

export const npmxDevProvider: Repo = {
	name: "npm-registry",
	hosts: ["npmx.dev", "npmjs.com"],

	toUrlString(): string | undefined {
		return undefined
	},

	async *candidates(input: string): AsyncGenerator<RepoContext> {
		const { trimmed, segments } = normalizeInput(input)
		let pkg: string | undefined

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && (parsed.host === "npmx.dev" || parsed.host === "www.npmjs.com" || parsed.host === "npmjs.com")) {
				const urlSegments = parsed.pathname.split("/").filter(Boolean)
				if (urlSegments[0] === "package" && urlSegments.length >= 2) {
					if (urlSegments[1]?.startsWith("@")) {
						if (urlSegments.length >= 3) pkg = `${urlSegments[1]}/${urlSegments[2]}`
					} else {
						pkg = urlSegments[1]
					}
				}
			}
		} else if (segments.length >= 2 && (segments[0] === "npmx.dev" || segments[0] === "npmjs.com")) {
			const rest = segments.slice(1)
			if (rest[0] === "package" && rest.length >= 2) {
				pkg = rest.slice(1).join("/")
			}
		} else if (segments.length === 1 && !segments[0]!.includes("/") && !segments[0]!.includes(".")) {
			pkg = segments[0]
		}

		if (!pkg) return

		const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
			method: "GET",
			headers: { "user-agent": "rekon-dl" },
		}).catch(() => null)

		if (!response || !response.ok) return

		const body = (await response.json()) as { repository?: { url?: string } }
		const repoUrl = body.repository?.url
		if (!repoUrl) return

		const cleaned = repoUrl
			.replace(/^git\+/, "")
			.replace(/^git:\/\//, "https://")
			.replace(/^ssh:\/\/git@/, "https://")
			.replace(/\.git$/, "")

		try {
			const resolved = new URL(cleaned)
			if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return
			const pathSegments = resolved.pathname.replace(/\.git$/, "").split("/").filter(Boolean)
			if (pathSegments.length < 2) return

			const ctx = new DefaultRepoContext()
			ctx.host = resolved.host
			ctx.org = pathSegments.slice(0, -1).join("/")
			ctx.project = pathSegments.at(-1)
			ctx.url = new URL(`https://${ctx.host}/${ctx.org}/${ctx.project}`)
			ctx.source.provider = "npm-registry"
			yield ctx
		} catch {
			return
		}
	},

	async *verify(_ctx: RepoContext, _signal: AbortSignal): AsyncGenerator<RepoContext> {
	},
}
