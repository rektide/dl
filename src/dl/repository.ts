import type { ParsedRepositoryInput, ResolvedRepo } from "./types.ts"

async function urlExists(url: string): Promise<boolean> {
	try {
		const response = await fetch(url, {
			method: "HEAD",
			redirect: "manual",
			signal: AbortSignal.timeout(8000),
		})
		return response.status >= 200 && response.status < 400
	} catch {
		return false
	}
}

function buildRepoPathCandidates(
	host: string | undefined,
	segments: string[],
): string[] {
	const candidates: string[] = []
	const addCandidate = (value: string) => {
		if (!value || candidates.includes(value)) {
			return
		}
		candidates.push(value)
	}

	const markerIndex = segments.indexOf("-")
	if (markerIndex >= 2) {
		addCandidate(segments.slice(0, markerIndex).join("/"))
	}

	const isGitHubHost = host?.includes("github.com") ?? false
	const isGitLabHost = host?.includes("gitlab") ?? false
	const hasGitHubMarker =
		segments.includes("blob") ||
		segments.includes("tree") ||
		segments.includes("raw")

	if (isGitHubHost || hasGitHubMarker) {
		addCandidate(segments.slice(0, 2).join("/"))
	}

	if (isGitLabHost || !host) {
		for (let length = segments.length; length >= 2; length--) {
			addCandidate(segments.slice(0, length).join("/"))
		}
	}

	if (!isGitHubHost && !isGitLabHost && !hasGitHubMarker) {
		addCandidate(segments.slice(0, 2).join("/"))
	}

	return candidates
}

export function parseRepositoryInput(input: string): ParsedRepositoryInput {
	const trimmedInput = input.trim()
	if (!trimmedInput) {
		throw new Error(`dl: unsupported repository input: ${input}`)
	}

	let host = ""
	let path = ""

	const sshMatch = trimmedInput.match(/^git@([^:]+):(.+)$/)
	if (sshMatch) {
		host = sshMatch[1]
		path = sshMatch[2]
	} else if (/^[a-z]+:\/\//i.test(trimmedInput)) {
		const url = new URL(trimmedInput)
		host = url.host
		path = url.pathname
	} else {
		const withoutQuery = trimmedInput.split(/[?#]/, 1)[0] ?? ""
		const normalized = withoutQuery.replace(/^\/+/, "")
		const firstSegment = normalized.split("/")[0] ?? ""
		const looksLikeHostPath =
			normalized.includes("/") &&
			(firstSegment.includes(".") || firstSegment === "localhost")

		if (looksLikeHostPath) {
			const url = new URL(`https://${trimmedInput}`)
			host = url.host
			path = url.pathname
		} else {
			path = normalized
		}
	}

	path = path.split(/[?#]/, 1)[0] ?? ""
	path = path.replace(/^\/+/, "")
	path = path.replace(/\.git$/, "")

	const segments = path.split("/").filter(Boolean)
	if (segments.length < 2) {
		throw new Error(`dl: unsupported repository input: ${input}`)
	}

	const hasGitHubMarker =
		segments.includes("blob") ||
		segments.includes("tree") ||
		segments.includes("raw")
	const repoPathCandidates = buildRepoPathCandidates(host || undefined, segments)
	if (repoPathCandidates.length === 0) {
		throw new Error(`dl: unsupported repository input: ${input}`)
	}

	return {
		host: host || undefined,
		repoPathCandidates,
		preferGitHub: hasGitHubMarker,
	}
}

async function validateRepositoryPath(
	host: string,
	repoPath: string,
): Promise<string | null> {
	const signal = AbortSignal.timeout(8000)

	if (host.includes("github.com")) {
		const parts = repoPath.split("/").filter(Boolean)
		if (parts.length !== 2) {
			return null
		}

		const base =
			host === "github.com"
				? "https://api.github.com"
				: `https://${host}/api/v3`
		const response = await fetch(`${base}/repos/${parts[0]}/${parts[1]}`, {
			method: "GET",
			headers: {
				"user-agent": "rekon-dl",
			},
			signal,
		}).catch(() => null)

		if (!response || !response.ok) {
			return null
		}
		return `${parts[0]}/${parts[1]}`
	}

	if (host.includes("gitlab")) {
		const encodedPath = encodeURIComponent(repoPath)
		const response = await fetch(
			`https://${host}/api/v4/projects/${encodedPath}`,
			{
				method: "GET",
				headers: {
					"user-agent": "rekon-dl",
				},
				signal,
			},
		).catch(() => null)

		if (!response || !response.ok) {
			return null
		}

		const body = (await response.json()) as { path_with_namespace?: string }
		return body.path_with_namespace ?? repoPath
	}

	if (await urlExists(`https://${host}/${repoPath}`)) {
		return repoPath
	}

	return null
}

export async function resolveRepository(input: string): Promise<ResolvedRepo> {
	const parsed = parseRepositoryInput(input)

	const hostCandidates = parsed.host
		? [parsed.host]
		: parsed.preferGitHub
			? ["github.com", "gitlab.com"]
			: ["gitlab.com", "github.com"]

	const isKnownHost = (h: string) =>
		h.includes("github.com") || h.includes("gitlab")

	for (const host of hostCandidates) {
		for (const repoPath of parsed.repoPathCandidates) {
			let namespacePath: string | null = null

			if (parsed.host && !isKnownHost(host)) {
				namespacePath = repoPath
			} else {
				namespacePath = await validateRepositoryPath(host, repoPath)
			}

			if (!namespacePath) {
				continue
			}

			const pathParts = namespacePath.split("/")
			const org = pathParts[0]
			const repo = pathParts[pathParts.length - 1]

			return {
				host,
				namespacePath,
				org,
				repo,
				cloneUrl: `https://${host}/${namespacePath}.git`,
			}
		}
	}

	const unresolvedSample = parsed.repoPathCandidates[0] ?? input
	const triedHosts = hostCandidates.join(", ")
	throw new Error(
		`dl: could not resolve host for ${unresolvedSample} (tried ${triedHosts})`,
	)
}
