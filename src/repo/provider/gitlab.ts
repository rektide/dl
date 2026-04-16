import type { RepoContext } from "../context.ts"
import { HostRepo } from "../base/host-repo.ts"
import type { PathSplit } from "../base/host-repo.ts"

/**
 * GitLab provider — nested orgs (all-but-last segment),
 * verifies via the GitLab REST API with path truncation probing.
 */
export class GitlabProvider extends HostRepo {
	name = "gitlab"
	hosts = ["gitlab.com"]

	splitPath(segments: string[]): PathSplit | null {
		if (segments.length < 2) return null
		return {
			org: segments.slice(0, -1).join("/"),
			project: segments.at(-1)!,
		}
	}

	async *verify(ctx: RepoContext, signal: AbortSignal): AsyncGenerator<RepoContext> {
		if (!ctx.org || !ctx.project) return

		const fullPath = `${ctx.org}/${ctx.project}`
		const segments = fullPath.split("/")

		for (let length = segments.length; length >= 2; length--) {
			const candidate = segments.slice(0, length).join("/")
			const encodedPath = encodeURIComponent(candidate)
			const response = await fetch(
				`https://gitlab.com/api/v4/projects/${encodedPath}`,
				{
					method: "GET",
					headers: { "user-agent": "rekon-dl" },
					signal,
				},
			).catch(() => null)

			if (!response || !response.ok) continue

			const body = (await response.json()) as {
				path_with_namespace?: string
			}
			const resolvedPath = body.path_with_namespace ?? candidate
			const parts = resolvedPath.split("/")

			ctx.org = parts.slice(0, -1).join("/")
			ctx.project = parts.at(-1)
			ctx.host = "gitlab.com"
			ctx.url = new URL(this.toUrlString(ctx)!)
			ctx.verified = true
			yield ctx
			return
		}
	}

	resolveWikiRepo(ctx: RepoContext): void {
		if (!ctx.url) return
		ctx.wikiRepoUrl = new URL(`${ctx.url.toString()}.wiki.git`)
	}
}

export const gitlabProvider = new GitlabProvider()
