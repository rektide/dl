import type { RepoContext } from "../context.ts"
import { HostRepo } from "../base/host-repo.ts"
import type { PathSplit } from "../base/host-repo.ts"

/**
 * GitHub provider — flat org (single segment), supports SSH,
 * verifies via the GitHub REST API.
 */
export class GithubProvider extends HostRepo {
	name = "github"
	hosts = ["github.com"]

	splitPath(segments: string[]): PathSplit | null {
		if (segments.length < 2) return null
		return { org: segments[0]!, project: segments[1]! }
	}

	async *verify(ctx: RepoContext, signal: AbortSignal): AsyncGenerator<RepoContext> {
		if (!ctx.org || !ctx.project) return

		const response = await fetch(
			`https://api.github.com/repos/${ctx.org}/${ctx.project}`,
			{
				method: "GET",
				headers: { "user-agent": "rekon-dl" },
				signal,
			},
		).catch(() => null)

		if (!response || !response.ok) return

		ctx.verified = true
		yield ctx
	}

	resolveWikiRepo(ctx: RepoContext): void {
		if (!ctx.url) return
		ctx.wikiRepoUrl = new URL(`${ctx.url.toString()}.wiki.git`)
	}
}

export const githubProvider = new GithubProvider()
