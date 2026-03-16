import type { RepoContext } from "./types.ts"

export interface ParsedInput {
	host: string | undefined
	path: string
	segments: string[]
}

export interface RepoProvider {
	name: string
	canHandle(parsed: ParsedInput): boolean
	resolve(input: string, parsed: ParsedInput): Promise<RepoContext | null>
}

export interface ProviderConfig {
	name: string
	hostMatchers: string[]
	buildPathCandidates: (segments: string[]) => string[]
	validate: (host: string, repoPath: string, signal: AbortSignal) => Promise<string | null>
}

export function createProvider(config: ProviderConfig): RepoProvider {
	return {
		name: config.name,
		canHandle(parsed: ParsedInput): boolean {
			if (!parsed.host) return false
			return config.hostMatchers.some((matcher) => parsed.host!.includes(matcher))
		},
		async resolve(input: string, parsed: ParsedInput): Promise<RepoContext | null> {
			if (!parsed.host) return null

			const candidates = config.buildPathCandidates(parsed.segments)
			const signal = AbortSignal.timeout(8000)

			for (const repoPath of candidates) {
				const namespacePath = await config.validate(parsed.host, repoPath, signal)
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
}

export async function resolveWithProviders(
	input: string,
	parsed: ParsedInput,
	providers: RepoProvider[],
): Promise<RepoContext> {
	for (const provider of providers) {
		if (!provider.canHandle(parsed)) continue
		const result = await provider.resolve(input, parsed)
		if (result) return result
	}

	throw new Error(`dl: could not resolve repository: ${input}`)
}
