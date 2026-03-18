import type { Expander } from "./types.ts"

export const hostPathExpander: Expander = {
	name: "host-path",
	expand(input: string): URL[] {
		const trimmed = input.trim()
		if (!trimmed.includes("/")) return []
		if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return []
		if (/^git@/.test(trimmed)) return []

		const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? ""
		const normalized = withoutQuery.replace(/^\/+/, "")
		const firstSegment = normalized.split("/")[0] ?? ""

		const looksLikeHost =
			firstSegment.includes(".") || firstSegment === "localhost"
		if (!looksLikeHost) return []

		try {
			const parsed = new URL(`https://${normalized}`)
			parsed.pathname = parsed.pathname.replace(/\.git$/, "")
			parsed.search = ""
			parsed.hash = ""
			return [parsed]
		} catch {
			return []
		}
	},
}
