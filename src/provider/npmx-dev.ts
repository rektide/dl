// pattern: Imperative Shell

import { stripGitPrefixes } from "../repo/clean-url.ts"
import { isUrl, normalizeInput, parseUrl } from "../repo/parse.ts"
import { RedirectProvider } from "./redirect.ts"

export class NpmxDevProvider extends RedirectProvider {
	name = "npm-registry"
	hosts = ["npmx.dev", "npmjs.com"] as const

	extractIdentifier(input: string): string | undefined {
		const { trimmed, segments } = normalizeInput(input)

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (
				parsed &&
				(parsed.host === "npmx.dev" || parsed.host === "www.npmjs.com" || parsed.host === "npmjs.com")
			) {
				const urlSegments = parsed.pathname.split("/").filter(Boolean)
				if (urlSegments[0] === "package" && urlSegments.length >= 2) {
					if (urlSegments[1]?.startsWith("@")) {
						if (urlSegments.length >= 3) return `${urlSegments[1]}/${urlSegments[2]}`
					} else {
						return urlSegments[1]
					}
				}
			}
			return undefined
		}

		if (
			segments.length >= 2 &&
			(segments[0] === "npmx.dev" || segments[0] === "npmjs.com")
		) {
			const rest = segments.slice(1)
			if (rest[0] === "package" && rest.length >= 2) {
				return rest.slice(1).join("/")
			}
			return undefined
		}

		if (
			segments.length === 1 &&
			!segments[0]!.includes("/") &&
			!segments[0]!.includes(".")
		) {
			return segments[0]
		}

		return undefined
	}

	async fetchRepoUrl(identifier: string, signal: AbortSignal): Promise<string | undefined> {
		const response = await fetch(
			`https://registry.npmjs.org/${encodeURIComponent(identifier)}/latest`,
			{
				method: "GET",
				headers: { "user-agent": "rekon-dl" },
				signal,
			},
		)

		if (!response.ok) return undefined

		const body = (await response.json()) as {
			repository?: { url?: string }
		}
		return body.repository?.url
	}

	protected override cleanRawUrl(raw: string): string {
		return stripGitPrefixes(raw)
	}
}

export const npmxDevProvider = new NpmxDevProvider()
