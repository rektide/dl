import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, parseUrl } from "../parse.ts"

export const cratesIoProvider: Repo = {
	name: "crates-io",
	hosts: ["crates.io"],

	toUrlString(): string | undefined {
		return undefined
	},

	async *candidates(input: string): AsyncGenerator<RepoContext> {
		const { trimmed, segments } = normalizeInput(input)
		let crateName: string | undefined

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "crates.io") {
				const urlSegments = parsed.pathname.split("/").filter(Boolean)
				if (urlSegments[0] === "crates" && urlSegments.length >= 2) {
					crateName = urlSegments[1]
				}
			}
		} else if (segments.length >= 2 && segments[0] === "crates.io" && segments[1] === "crates" && segments.length >= 3) {
			crateName = segments[2]
		} else if (segments.length === 1 && !segments[0]!.includes("/") && !segments[0]!.includes(".")) {
			crateName = segments[0]
		}

		if (!crateName) return

		const response = await fetch(`https://crates.io/api/v1/crates/${crateName}`, {
			method: "GET",
			headers: { "user-agent": "rekon-dl" },
		}).catch(() => null)

		if (!response || !response.ok) return

		const body = (await response.json()) as { crate?: { repository?: string } }
		const repoUrl = body.crate?.repository
		if (!repoUrl) return

		try {
			const resolved = new URL(repoUrl)
			if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return
			const pathSegments = resolved.pathname.replace(/\.git$/, "").split("/").filter(Boolean)
			if (pathSegments.length < 2) return

			const ctx = new DefaultRepoContext()
			ctx.host = resolved.host
			ctx.org = pathSegments.slice(0, -1).join("/")
			ctx.project = pathSegments.at(-1)
			ctx.url = new URL(`https://${ctx.host}/${ctx.org}/${ctx.project}`)
			ctx.source.provider = "crates-io"
			yield ctx
		} catch {
			return
		}
	},

	async *verify(_ctx: RepoContext, _signal: AbortSignal): AsyncGenerator<RepoContext> {
	},
}

export const docsRsProvider: Repo = {
	name: "docs-rs",
	hosts: ["docs.rs"],

	toUrlString(): string | undefined {
		return undefined
	},

	async *candidates(input: string): AsyncGenerator<RepoContext> {
		const { trimmed, segments } = normalizeInput(input)
		let crateName: string | undefined

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "docs.rs") {
				const urlSegments = parsed.pathname.split("/").filter(Boolean)
				if (urlSegments.length >= 1) {
					crateName = urlSegments[0] === "crate" ? urlSegments[1] : urlSegments[0]
				}
			}
		} else if (segments.length >= 2 && segments[0] === "docs.rs") {
			crateName = segments[1] === "crate" ? segments[2] : segments[1]
		} else if (segments.length === 1 && !segments[0]!.includes("/") && !segments[0]!.includes(".")) {
			crateName = segments[0]
		}

		if (!crateName) return

		const response = await fetch(`https://crates.io/api/v1/crates/${crateName}`, {
			method: "GET",
			headers: { "user-agent": "rekon-dl" },
		}).catch(() => null)

		if (!response || !response.ok) return

		const body = (await response.json()) as { crate?: { repository?: string } }
		const repoUrl = body.crate?.repository
		if (!repoUrl) return

		try {
			const resolved = new URL(repoUrl)
			if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return
			const pathSegments = resolved.pathname.replace(/\.git$/, "").split("/").filter(Boolean)
			if (pathSegments.length < 2) return

			const ctx = new DefaultRepoContext()
			ctx.host = resolved.host
			ctx.org = pathSegments.slice(0, -1).join("/")
			ctx.project = pathSegments.at(-1)
			ctx.url = new URL(`https://${ctx.host}/${ctx.org}/${ctx.project}`)
			ctx.source.provider = "docs-rs"
			yield ctx
		} catch {
			return
		}
	},

	async *verify(_ctx: RepoContext, _signal: AbortSignal): AsyncGenerator<RepoContext> {
	},
}
