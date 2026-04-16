import type { RepoContext } from "../context.ts"
import { HostRepo } from "../base/host-repo.ts"
import type { PathSplit } from "../base/host-repo.ts"

/**
 * Tangled provider — flat org (single segment), no SSH support,
 * verifies via GET (tangled returns 405 for HEAD).
 */
export class TangledProvider extends HostRepo {
	name = "tangled"
	hosts = ["tangled.org"]

	get supportsSsh(): boolean {
		return false
	}

	splitPath(segments: string[]): PathSplit | null {
		if (segments.length < 2) return null
		return { org: segments[0]!, project: segments[1]! }
	}

	async *verify(ctx: RepoContext, signal: AbortSignal): AsyncGenerator<RepoContext> {
		if (!ctx.org || !ctx.project) return

		const response = await fetch(
			`https://tangled.org/${ctx.org}/${ctx.project}`,
			{
				method: "GET",
				signal,
			},
		).catch(() => null)

		if (!response || !response.ok) return

		ctx.verified = true
		yield ctx
	}
}

export const tangledProvider = new TangledProvider()
