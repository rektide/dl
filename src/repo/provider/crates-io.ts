import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, parseUrl } from "../parse.ts"

async function resolveCratesRepository(
	crateName: string,
	signal: AbortSignal,
): Promise<RepoContext | undefined> {
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
		ctx.verified = true
		return ctx
	} catch {
		return undefined
	}
}

export const cratesIoProvider: Repo = {
	name: "crates-io",
	hosts: ["crates.io"],

	candidates(input: string): RepoContext[] {
		const { trimmed, segments } = normalizeInput(input)
		const results: RepoContext[] = []

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "crates.io" && segments[0] === "crates" && segments.length >= 2) {
				const ctx = new DefaultRepoContext()
				ctx.url = new URL(`https://crates.io/crates/${segments[1]}`)
				ctx.source.provider = "crates-io"
				results.push(ctx)
			}
			return results
		}

		if (segments.length >= 2 && segments[0] === "crates.io" && segments[1] === "crates" && segments.length >= 3) {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://crates.io/crates/${segments[2]}`)
			ctx.source.provider = "crates-io"
			results.push(ctx)
			return results
		}

		if (segments.length === 1 && !segments[0]!.includes("/") && !segments[0]!.includes(".")) {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://crates.io/crates/${segments[0]}`)
			ctx.source.provider = "crates-io"
			results.push(ctx)
		}

		return results
	},

	async verify(ctx: RepoContext, signal: AbortSignal): Promise<RepoContext | undefined> {
		if (!ctx.url) return undefined
		const segments = ctx.url.pathname.split("/").filter(Boolean)
		if (segments[0] !== "crates" || segments.length < 2) return undefined
		return resolveCratesRepository(segments[1]!, signal)
	},
}

export const docsRsProvider: Repo = {
	name: "docs-rs",
	hosts: ["docs.rs"],

	candidates(input: string): RepoContext[] {
		const { trimmed, segments } = normalizeInput(input)
		const results: RepoContext[] = []

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "docs.rs" && segments.length >= 1) {
				const crateName = segments[0] === "crate" ? segments[1] : segments[0]
				if (crateName) {
					const ctx = new DefaultRepoContext()
					ctx.url = new URL(`https://docs.rs/${crateName}`)
					ctx.source.provider = "docs-rs"
					results.push(ctx)
				}
			}
			return results
		}

		if (segments.length >= 2 && segments[0] === "docs.rs") {
			const crateName = segments[1] === "crate" ? segments[2] : segments[1]
			if (crateName) {
				const ctx = new DefaultRepoContext()
				ctx.url = new URL(`https://docs.rs/${crateName}`)
				ctx.source.provider = "docs-rs"
				results.push(ctx)
			}
			return results
		}

		if (segments.length === 1 && !segments[0]!.includes("/") && !segments[0]!.includes(".")) {
			const ctx = new DefaultRepoContext()
			ctx.url = new URL(`https://docs.rs/${segments[0]}`)
			ctx.source.provider = "docs-rs"
			results.push(ctx)
		}

		return results
	},

	async verify(ctx: RepoContext, signal: AbortSignal): Promise<RepoContext | undefined> {
		if (!ctx.url) return undefined
		const segments = ctx.url.pathname.split("/").filter(Boolean)
		if (segments.length === 0) return undefined

		const crateName = segments[0] === "crate" ? segments[1] : segments[0]
		if (!crateName) return undefined

		return resolveCratesRepository(crateName, signal)
	},
}
