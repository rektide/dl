import { DefaultRepoContext } from "./context.ts"
import type { RepoContext } from "./context.ts"

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

	const extrasIndex = segments.findIndex(
		(s) =>
			s === "tree" ||
			s === "blob" ||
			s === "raw" ||
			s === "blame" ||
			s === "commits" ||
			s === "commit" ||
			s === "issues" ||
			s === "pull" ||
			s === "releases" ||
			s === "tags" ||
			s === "actions" ||
			s === "wiki" ||
			s === "archive" ||
			s === "uploads" ||
			s === "packages" ||
			s === "container" ||
			s === "settings" ||
			s === "notifications" ||
			s === "fork" ||
			s === "compare" ||
			s === "milestone" ||
			s === "projects" ||
			s === "security" ||
			s === "pulse" ||
			s === "graphs" ||
			s === "network" ||
			s === "stargazers" ||
			s === "watchers" ||
			s === "-/blob" ||
			s === "-/tree" ||
			s === "-/raw" ||
			s === "-/blame" ||
			s === "-/commits" ||
			s === "-/commit" ||
			s === "-/issues" ||
			s === "-/merge_requests" ||
			s === "-/pipelines" ||
			s === "-/jobs" ||
			s === "-/artifacts" ||
			s === "-/packages" ||
			s === "-/container_registry" ||
			s === "-/settings" ||
			s === "-/wiki",
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

/**
 * Convert a cleaned repo URL into a canonical RepoContext.
 * The context's host/org/project are extracted from the URL path,
 * and `url` is set to the canonical HTTPS form.
 */
export function repoUrlToContext(
	raw: string | URL,
	providerName: string,
	options: CleanUrlOptions = ALL_CLEAN,
): RepoContext | null {
	const url = raw instanceof URL ? raw : cleanRepoUrl(raw, options)
	if (!url) return null

	const pathSegments = url.pathname.split("/").filter(Boolean)
	if (pathSegments.length < 2) return null

	const ctx = new DefaultRepoContext()
	ctx.host = url.host
	ctx.org = pathSegments.slice(0, -1).join("/")
	ctx.project = pathSegments.at(-1)
	ctx.url = new URL(`https://${ctx.host}/${ctx.org}/${ctx.project}`)
	ctx.source.provider = providerName
	return ctx
}
