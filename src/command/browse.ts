import * as clack from "@clack/prompts"
import { cancel, isCancel, multiselect } from "@clack/prompts"
import type { OrgRepo, BrowseProvider } from "../provider/browse.ts"
import { formatRepoLabel } from "../provider/browse.ts"
import { githubProvider } from "../provider/github.ts"

const providers: ReadonlyArray<BrowseProvider & { name: string; hosts: ReadonlyArray<string> }> = [
	githubProvider,
]

function resolveProvider(input: string): { org: string; provider: typeof providers[number] } | null {
	const trimmed = input.trim()
	if (!trimmed) return null

	let host: string | null = null
	let org: string | null = null

	try {
		const parsed = new URL(trimmed)
		host = parsed.host
		const segments = parsed.pathname.split("/").filter(Boolean)
		org = segments[0] ?? null
	} catch {
		const segments = trimmed.split("/").filter(Boolean)
		if (segments.length >= 2 && segments[0]!.includes(".")) {
			host = segments[0]!
			org = segments[1]!
		} else if (segments.length >= 1) {
			org = segments[0]!
		}
	}

	if (!org) return null

	if (host) {
		const provider = providers.find((p) => p.hosts.includes(host!))
		if (provider) return { org, provider }
	}

	return { org, provider: providers[0]! }
}

export async function collectRepos(
	input: string,
	signal: AbortSignal,
): Promise<string[]> {
	const resolved = resolveProvider(input)
	if (!resolved) {
		clack.note(`Could not resolve provider for: ${input}`, "Error")
		return []
	}

	const { org, provider } = resolved

	const spinner = clack.spinner()
	spinner.start(`Fetching repos from ${provider.name}/${org}`)

	const repos: OrgRepo[] = []
	try {
		for await (const repo of provider.browseOrg(org, signal)) {
			repos.push(repo)
		}
	} catch (error) {
		spinner.stop(`Failed to fetch repos from ${provider.name}/${org}`)
		const message = error instanceof Error ? error.message : String(error)
		clack.note(message, "Error")
		return []
	}

	if (repos.length === 0) {
		spinner.stop(`No repos found for ${org}`)
		return []
	}

	spinner.stop(`Found ${repos.length} repos in ${org}`)

	const now = new Date()
	const options = repos.map((repo) => ({
		value: repo.url.toString(),
		label: formatRepoLabel(repo, now),
		hint: repo.description?.slice(0, 60),
	}))

	const selected = await multiselect({
		message: `Select repos to download from ${org}:`,
		options,
		required: false,
	})

	if (isCancel(selected)) {
		cancel("Cancelled")
		return []
	}

	return selected as string[]
}
