import type { Expander } from "./types.ts"

export interface ShorthandExpanderOptions {
	defaultHosts: string[]
}

export function createShorthandExpander(options: ShorthandExpanderOptions): Expander {
	return {
		name: "shorthand",
		expand(input: string): URL[] {
			const trimmed = input.trim()
			if (!trimmed) return []
			if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return []
			if (/^git@/.test(trimmed)) return []

			const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? ""
			const normalized = withoutQuery.replace(/^\/+/, "")

			if (!normalized.includes("/")) return []

			const path = normalized.replace(/\.git$/, "")

			const urls: URL[] = []
			for (const host of options.defaultHosts) {
				try {
					urls.push(new URL(`https://${host}/${path}`))
				} catch {
					// skip invalid hosts
				}
			}
			return urls
		},
	}
}
