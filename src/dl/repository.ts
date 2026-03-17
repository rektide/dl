import type { RepoContext } from "./types.ts"
import { createProvider, type ParsedInput, type RepoProvider, resolveWithProviders } from "./provider.ts"

const TANGLED_DOMAINS = ["tangled.org", "tangled.sh", "tangled.com"]

function isTangledDomain(host: string): boolean {
	return TANGLED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
}

function isTangledStylePath(host: string | undefined, segments: string[]): boolean {
	if (segments.length === 1 && host?.includes(".") && !host.includes("github") && !host.includes("gitlab")) {
		return true
	}
	return false
}

async function urlExists(url: string, signal: AbortSignal): Promise<boolean> {
	try {
		const response = await fetch(url, {
			method: "HEAD",
			redirect: "manual",
			signal,
		})
		return response.status >= 200 && response.status < 400
	} catch {
		return false
	}
}

function buildGitHubCandidates(segments: string[]): string[] {
	if (segments.length < 2) return []
	return [segments.slice(0, 2).join("/")]
}

async function validateGitHubPath(
	host: string,
	repoPath: string,
	signal: AbortSignal,
): Promise<string | null> {
	const parts = repoPath.split("/").filter(Boolean)
	if (parts.length !== 2) return null

	const base = host === "github.com" ? "https://api.github.com" : `https://${host}/api/v3`
	const response = await fetch(`${base}/repos/${parts[0]}/${parts[1]}`, {
		method: "GET",
		headers: { "user-agent": "rekon-dl" },
		signal,
	}).catch(() => null)

	if (!response || !response.ok) return null
	return `${parts[0]}/${parts[1]}`
}

function buildGitLabCandidates(segments: string[]): string[] {
	const candidates: string[] = []
	for (let length = segments.length; length >= 2; length--) {
		const candidate = segments.slice(0, length).join("/")
		if (candidate && !candidates.includes(candidate)) {
			candidates.push(candidate)
		}
	}
	return candidates
}

function buildGenericCandidates(segments: string[]): string[] {
	const candidates: string[] = []
	for (let length = segments.length; length >= 1; length--) {
		const candidate = segments.slice(0, length).join("/")
		if (candidate && !candidates.includes(candidate)) {
			candidates.push(candidate)
		}
	}
	return candidates
}

async function validateGenericPath(
	host: string,
	repoPath: string,
	signal: AbortSignal,
): Promise<string | null> {
	const url = `https://${host}/${repoPath}`
	const exists = await urlExists(url, signal)
	return exists ? repoPath : null
}

async function validateGitLabPath(
	host: string,
	repoPath: string,
	signal: AbortSignal,
): Promise<string | null> {
	const encodedPath = encodeURIComponent(repoPath)
	const response = await fetch(`https://${host}/api/v4/projects/${encodedPath}`, {
		method: "GET",
		headers: { "user-agent": "rekon-dl" },
		signal,
	}).catch(() => null)

	if (!response || !response.ok) return null

	const body = (await response.json()) as { path_with_namespace?: string }
	return body.path_with_namespace ?? repoPath
}

function buildTangledCandidates(segments: string[]): string[] {
	if (segments.length < 2) return []
	if (!segments[0]?.includes(".")) return []
	return [segments.slice(0, 2).join("/")]
}

async function validateTangledPath(
	host: string,
	repoPath: string,
	signal: AbortSignal,
): Promise<string | null> {
	try {
		const response = await fetch(`https://${host}/${repoPath}`, {
			method: "GET",
			signal,
		}).catch(() => null)

		if (!response) return null
		if (response.status >= 200 && response.status < 400) return repoPath
		if (response.status === 405) return repoPath
		return null
	} catch {
		return null
	}
}

const gitHubProvider = createProvider({
	name: "github",
	hostMatchers: ["github.com"],
	buildPathCandidates: buildGitHubCandidates,
	validate: validateGitHubPath,
})

const gitLabProvider = createProvider({
	name: "gitlab",
	hostMatchers: ["gitlab"],
	buildPathCandidates: buildGitLabCandidates,
	validate: validateGitLabPath,
})

const genericProvider: RepoProvider = {
	name: "generic",
	canHandle(parsed: ParsedInput): boolean {
		if (!parsed.host) return false
		if (isTangledDomain(parsed.host)) return false
		if (parsed.host.includes("github")) return false
		if (parsed.host.includes("gitlab")) return false
		return true
	},
	async resolve(input: string, parsed: ParsedInput): Promise<RepoContext | null> {
		if (!parsed.host) return null

		const candidates = buildGenericCandidates(parsed.segments)
		const signal = AbortSignal.timeout(8000)

		for (const repoPath of candidates) {
			const namespacePath = await validateGenericPath(parsed.host, repoPath, signal)
			if (!namespacePath) continue

			const pathParts = namespacePath.split("/")
			const org = pathParts[0]
			const repo = pathParts[pathParts.length - 1]

			return {
				input,
				host: parsed.host,
				namespacePath,
				org,
				repo,
				cloneUrl: `https://${parsed.host}/${namespacePath}.git`,
				repoUrl: `https://${parsed.host}/${namespacePath}`,
				deepwikiUrl: `https://deepwiki.com/${org}/${repo}`,
				wikiCloneUrl: `https://${parsed.host}/${namespacePath}.wiki.git`,
			}
		}

		return null
	},
}

const tangledProvider: RepoProvider = {
	name: "tangled",
	canHandle(parsed: ParsedInput): boolean {
		if (parsed.host && isTangledDomain(parsed.host)) return true
		return isTangledStylePath(parsed.host, parsed.segments)
	},
	async resolve(input: string, parsed: ParsedInput): Promise<RepoContext | null> {
		const host = isTangledStylePath(parsed.host, parsed.segments)
			? "tangled.org"
			: parsed.host

		if (!host) return null

		let segments = parsed.segments
		if (isTangledStylePath(parsed.host, parsed.segments)) {
			segments = [parsed.host!, ...parsed.segments]
		}

		const candidates = buildTangledCandidates(segments)
		if (candidates.length === 0) return null

		const signal = AbortSignal.timeout(8000)

		for (const repoPath of candidates) {
			const namespacePath = await validateTangledPath(host, repoPath, signal)
			if (!namespacePath) continue

			const pathParts = namespacePath.split("/")
			const org = pathParts[0]
			const repo = pathParts[pathParts.length - 1]

			return {
				input,
				host,
				namespacePath,
				org,
				repo,
				cloneUrl: `https://${host}/${namespacePath}.git`,
				repoUrl: `https://${host}/${namespacePath}`,
				deepwikiUrl: `https://deepwiki.com/${org}/${repo}`,
				wikiCloneUrl: `https://${host}/${namespacePath}.wiki.git`,
			}
		}

		return null
	},
}

const providers: RepoProvider[] = [gitHubProvider, gitLabProvider, genericProvider, tangledProvider]

export function parseInput(input: string): ParsedInput {
	const trimmedInput = input.trim()
	if (!trimmedInput) {
		throw new Error(`dl: unsupported repository input: ${input}`)
	}

	let host: string | undefined
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
			host = "github.com"
			path = normalized
		}
	}

	path = path.split(/[?#]/, 1)[0] ?? ""
	path = path.replace(/^\/+/, "")
	path = path.replace(/\.git$/, "")

	const segments = path.split("/").filter(Boolean)

	return { host, path, segments }
}

export async function resolveRepository(input: string): Promise<RepoContext> {
	const parsed = parseInput(input)

	if (isTangledStylePath(parsed.host, parsed.segments)) {
		return resolveWithProviders(input, parsed, providers)
	}

	if (parsed.segments.length < 2) {
		throw new Error(`dl: unsupported repository input: ${input}`)
	}

	return resolveWithProviders(input, parsed, providers)
}
