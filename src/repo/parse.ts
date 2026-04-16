export function normalizeInput(input: string): {
	trimmed: string
	withoutQuery: string
	path: string
	segments: string[]
} {
	const trimmed = input.trim()
	const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? ""
	const path = withoutQuery.replace(/^\/+/, "").replace(/\.git$/, "")
	const segments = path.split("/").filter(Boolean)
	return { trimmed, withoutQuery, path, segments }
}

export function isUrl(input: string): boolean {
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
}

export function isSsh(input: string): boolean {
	return /^git@/.test(input)
}

export function looksLikeHost(segment: string): boolean {
	return segment.includes(".") || segment === "localhost"
}

export function parseSsh(input: string): { host: string; path: string } | undefined {
	const match = input.trim().match(/^git@([^:]+):(.+)$/)
	if (!match) return undefined
	return { host: match[1], path: match[2].replace(/\.git$/, "").split(/[?#]/, 1)[0] ?? "" }
}

export function parseUrl(input: string): URL | undefined {
	try {
		const parsed = new URL(input.trim())
		const pathname = parsed.pathname.replace(/\.git$/, "")
		const protocol =
			parsed.protocol === "ssh:" || parsed.protocol === "git:"
				? "https:"
				: parsed.protocol
		return new URL(`${protocol}//${parsed.host}${pathname}`)
	} catch {
		return undefined
	}
}
