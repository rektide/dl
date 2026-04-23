// pattern: Imperative Shell

import { isUrl, normalizeInput, parseUrl } from "../repo/parse.ts"
import { RedirectProvider } from "./redirect.ts"

export class CratesIoProvider extends RedirectProvider {
	name = "crates-io"
	hosts: ReadonlyArray<string> = ["crates.io"]

	extractIdentifier(input: string): string | undefined {
		const { trimmed, segments } = normalizeInput(input)

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "crates.io") {
				const urlSegments = parsed.pathname.split("/").filter(Boolean)
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

	async fetchRepoUrl(identifier: string, signal: AbortSignal): Promise<string | undefined> {
		const response = await fetch(`https://crates.io/api/v1/crates/${identifier}`, {
			method: "GET",
			headers: { "user-agent": "rekon-dl" },
			signal,
		})

		if (!response.ok) return undefined

		const body = (await response.json()) as {
			crate?: { repository?: string }
		}
		return body.crate?.repository
	}
}

export const cratesIoProvider = new CratesIoProvider()
