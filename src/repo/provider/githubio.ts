import { normalizeInput, isUrl, parseUrl } from "../parse.ts"
import { stripGitPrefixes } from "../clean-url.ts"
import { RedirectRepo } from "../base/redirect-repo.ts"

export class GithubioProvider extends RedirectRepo {
	name = "githubio"
	hosts = ["github.io"]

	extractIdentifier(input: string): string | undefined {
		const { trimmed } = normalizeInput(input)

		if (!isUrl(trimmed)) return undefined
		const parsed = parseUrl(trimmed)
		if (!parsed) return undefined

		const host = parsed.host
		const suffix = ".github.io"
		if (!host.endsWith(suffix)) return undefined
		if (host === suffix) return undefined

		const org = host.slice(0, -suffix.length)
		const segments = parsed.pathname.split("/").filter(Boolean)
		if (segments.length < 1) return undefined

		return `${org}/${segments[0]}`
	}

	async fetchRepoUrl(
		identifier: string,
		_signal: AbortSignal,
	): Promise<string | undefined> {
		return `https://github.com/${identifier}`
	}

	protected override cleanRawUrl(raw: string): string {
		return stripGitPrefixes(raw)
	}
}

export const githubioProvider = new GithubioProvider()
