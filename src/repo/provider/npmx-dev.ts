import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, parseUrl } from "../parse.ts"

function parsePackagePath(pathname: string): string | undefined {
	const segments = pathname.split("/").filter(Boolean)
	if (segments[0] !== "package" || segments.length < 2) return undefined

	if (segments[1]?.startsWith("@")) {
		if (segments.length < 3) return undefined
		return `${segments[1]}/${segments[2]}`
	}

	return segments[1]
}

export const npmxDevProvider: Repo = {
	name: "npm-registry",
	hosts: ["npmx.dev", "npmjs.com"],

	candidates(input: string): RepoContext[] {
		const { trimmed, segments } = normalizeInput(input)
		const results: RepoContext[] = []

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && (parsed.host === "npmx.dev" || parsed.host === "www.npmjs.com" || parsed.host === "npmjs.com")) {
				const pkg = parsePackagePath(parsed.pathname)
				if (pkg) {
					const ctx = new DefaultRepoContext()
					ctx.url = new URL(`https://npmx.dev/package/${pkg}`)
					ctx.source.provider = "npm-registry"
					results.push(ctx)
				}
			}
			return results
		}

		if (segments.length >= 2 && (segments[0] === "npmx.dev" || segments[0] === "npmjs.com")) {
			const rest = segments.slice(1)
			if (rest[0] === "package" && rest.length >= 2) {
				const ctx = new DefaultRepoContext()
				ctx.url = new URL(`https://npmx.dev/package/${rest.slice(1).join("/")}`)
				ctx.source.provider = "npm-registry"
				results.push(ctx)
			}
			return results
		}

		if (segments.length === 1 && !segments[0]!.includes("/") && !segments[0]!.includes(".")) {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://npmx.dev/package/${segments[0]}`)
			ctx.source.provider = "npm-registry"
			results.push(ctx)
		}

		return results
	},

	async verify(ctx: RepoContext, signal: AbortSignal): Promise<RepoContext | undefined> {
		if (!ctx.url) return undefined
		const pkg = parsePackagePath(ctx.url.pathname)
		if (!pkg) return undefined

		const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
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

			ctx.url = new URL(`https://${resolved.host}${resolved.pathname.replace(/\.git$/, "")}`)
			ctx.verified = true
			return ctx
		} catch {
			return undefined
		}
	},
}
