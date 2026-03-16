import type { RepoContext } from "./types.ts"
import { createProvider, type ParsedInput, type RepoProvider, resolveWithProviders } from "./provider.ts"

const TANGLED_DOMAINS = ["tangled.org", "tangled.sh", "tangled.com"]

function isTangledDomain(host: string): boolean {
	return TANGLED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
}

function parseTangledPath(segments: string[]): { org: string; repo: string } | null {
	if (segments.length < 2) return null
	const org = segments[0]
	const repo = segments[1]
	if (!org || !repo) return null
	if (!org.includes(".")) return null
	return { org, repo }
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

const providers: RepoProvider[] = [gitHubProvider, gitLabProvider]

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

	if (parsed.host && isTangledDomain(parsed.host)) {
		const segments = parsed.segments
		const tangled = parseTangledPath(segments)
		if (tangled) {
			const namespacePath = `${tangled.org}/${tangled.repo}`
			return {
				input,
				host: parsed.host,
				namespacePath,
				org: tangled.org,
				repo: tangled.repo,
				cloneUrl: `https://${parsed.host}/${namespacePath}.git`,
				repoUrl: `https://${parsed.host}/${namespacePath}`,
				deepwikiUrl: `https://deepwiki.com/${tangled.org}/${tangled.repo}`,
				wikiCloneUrl: `https://${parsed.host}/${namespacePath}.wiki.git`,
			}
		}
	}

	if (parsed.segments.length < 2) {
		throw new Error(`dl: unsupported repository input: ${input}`)
	}

	return resolveWithProviders(input, parsed, providers)
}
