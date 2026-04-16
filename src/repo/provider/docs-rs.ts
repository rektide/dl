import { CratesIoProvider } from "./crates-io.ts"
import { normalizeInput, isUrl, parseUrl } from "../parse.ts"

/**
 * Docs.rs provider — resolves Rust documentation URLs and crate names
 * to their repository URL. Inherits the crates.io API lookup from CratesIoProvider;
 * only input parsing differs.
 */
export class DocsRsProvider extends CratesIoProvider {
	name = "docs-rs"
	hosts = ["docs.rs"]

	override extractIdentifier(input: string): string | undefined {
		const { trimmed, segments } = normalizeInput(input)

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (parsed && parsed.host === "docs.rs") {
				const urlSegments = parsed.pathname
					.split("/")
					.filter(Boolean)
				if (urlSegments.length >= 1) {
					return urlSegments[0] === "crate"
						? urlSegments[1]
						: urlSegments[0]
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
