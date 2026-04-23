// pattern: Imperative Shell

import { isUrl, normalizeInput, parseUrl } from "../repo/parse.ts"
import { CratesIoProvider } from "./crates-io.ts"

export class DocsRsProvider extends CratesIoProvider {
	name = "docs-rs"
	hosts: ReadonlyArray<string> = ["docs.rs"]

	override extractIdentifier(input: string): string | undefined {
		const { trimmed, segments } = normalizeInput(input)

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "docs.rs") {
				const urlSegments = parsed.pathname.split("/").filter(Boolean)
				if (urlSegments.length >= 1) {
					return urlSegments[0] === "crate" ? urlSegments[1] : urlSegments[0]
				}
			}
			return undefined
		}

		if (segments.length >= 2 && segments[0] === "docs.rs") {
			return segments[1] === "crate" ? segments[2] : segments[1]
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
}

export const docsRsProvider = new DocsRsProvider()
