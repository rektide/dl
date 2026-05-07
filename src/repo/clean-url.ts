/** Flags controlling which URL cleanups to apply. */
export interface CleanUrlOptions {
	gitPrefixes: boolean
	gitSuffix: boolean
	repoPathExtras: boolean
	queryAndHash: boolean
}

/** Singleton with all cleanups enabled. */
export const ALL_CLEAN: CleanUrlOptions = {
	gitPrefixes: true,
	gitSuffix: true,
	repoPathExtras: true,
	queryAndHash: true,
}

const GIT_PREFIX_PATTERNS = [
	/^git\+/,
	/^git:\/\//,
	/^ssh:\/\/git@/,
]

/** Strip `git+`, `git://`, and `ssh://git@` prefixes from a raw URL string. */
export function stripGitPrefixes(raw: string): string {
	let url = raw
	for (const pattern of GIT_PREFIX_PATTERNS) {
		url = url.replace(pattern, "")
	}
	if (raw.match(/^git:\/\//)) url = `https://${url}`
	if (raw.match(/^(git\+)?ssh:\/\/git@/)) url = `https://${url}`
	return url
}

/** Remove `.git` suffix from a URL pathname. */
export function stripGitSuffix(url: URL): URL {
	if (!url.pathname.endsWith(".git")) return url
	const cleaned = new URL(url.toString())
	cleaned.pathname = cleaned.pathname.replace(/\.git$/, "")
	return cleaned
}

/**
 * Remove repo-internal path segments like `/tree/...`, `/blob/...`,
 * `/-/blob/...`, and similar GitHub/GitLab extras that extend past
 * the org/project boundary.
 */
export function stripRepoPathExtras(url: URL): URL {
	const segments = url.pathname.split("/").filter(Boolean)
	if (segments.length < 2) return url

	const EXTRAS = new Set([
		"tree", "blob", "raw", "blame", "commits", "commit",
		"issues", "pull", "releases", "tags", "actions", "wiki",
		"archive", "uploads", "packages", "container", "settings",
		"notifications", "fork", "compare", "milestone", "projects",
		"security", "pulse", "graphs", "network", "stargazers", "watchers",
		"merge_requests", "pipelines", "jobs", "artifacts",
		"container_registry",
	])

	const extrasIndex = segments.findIndex(
		(s, i) => {
			if (EXTRAS.has(s)) return true
			if (s === "-" && i + 1 < segments.length && EXTRAS.has(segments[i + 1]!)) return true
			return false
		},
	)

	if (extrasIndex < 2) return url

	const cleaned = new URL(url.toString())
	cleaned.pathname = "/" + segments.slice(0, extrasIndex).join("/")
	return cleaned
}

/** Remove query parameters and hash fragments. */
export function stripQueryAndHash(url: URL): URL {
	const cleaned = new URL(url.toString())
	cleaned.search = ""
	cleaned.hash = ""
	return cleaned
}

/**
 * Apply all configured cleanups to a raw URL string.
 * Returns `null` if the result isn't a usable HTTPS/HTTP URL.
 */
export function cleanRepoUrl(
	raw: string,
	options: CleanUrlOptions = ALL_CLEAN,
): URL | null {
	let str = raw

	if (options.gitPrefixes) str = stripGitPrefixes(str)

	let url: URL
	try {
		url = new URL(str)
	} catch {
		return null
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") return null
	if (options.queryAndHash) url = stripQueryAndHash(url)
	if (options.repoPathExtras) url = stripRepoPathExtras(url)
	if (options.gitSuffix) url = stripGitSuffix(url)

	return url
}


