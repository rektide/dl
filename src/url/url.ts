import type { Expander } from "./types.ts"

export const urlExpander: Expander = {
	name: "url",
	expand(input: string): URL[] {
		const trimmed = input.trim()
		if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return []

		try {
			const parsed = new URL(trimmed)
			const pathname = parsed.pathname.replace(/\.git$/, "")
			const protocol =
				parsed.protocol === "ssh:" || parsed.protocol === "git:"
					? "https:"
					: parsed.protocol
			return [new URL(`${protocol}//${parsed.host}${pathname}`)]
		} catch {
			return []
		}
	},
}
