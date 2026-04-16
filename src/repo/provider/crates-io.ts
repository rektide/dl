import type { RepoContext } from "../context.ts"
import { RedirectRepo } from "../base/redirect-repo.ts"
import { normalizeInput, isUrl, parseUrl } from "../parse.ts"

/**
 * Crates.io provider — resolves crate names to their repository URL
 * via the crates.io API.
 */
export class CratesIoProvider extends RedirectRepo {
	name = "crates-io"
	hosts = ["crates.io"]

	extractIdentifier(input: string): string | undefined {
		const { trimmed, segments } = normalizeInput(input)

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "crates.io") {
				const urlSegments = parsed.pathname
					.split("/")
					.filter(Boolean)
				if (urlSegments[0] === "crates" && urlSegments.length >= 2) {
					return urlSegments[1]
				}
			}
			return undefined
		}

		if (
			segments.length >= 3 &&
			segments[0] === "crates.io" &&
			segments[1] === "crates"
		) {
			return segments[2]
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

	async fetchRepoUrl(
		identifier: string,
		signal: AbortSignal,
	): Promise<string | undefined> {
		const response = await fetch(
			`https://crates.io/api/v1/crates/${identifier}`,
			{
				method: "GET",
				headers: { "user-agent": "rekon-dl" },
				signal,
			},
		).catch(() => null)

		if (!response || !response.ok) return undefined

		const body = (await response.json()) as {
			crate?: { repository?: string }
		}
		return body.crate?.repository
	}
}

export const cratesIoProvider = new CratesIoProvider()
