import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { normalizeInput, isUrl, isSsh, parseSsh, parseUrl } from "../parse.ts"

/**
 * Thrown by base class methods that require a subclass override.
 * If you see this, the concrete provider forgot to implement a required method.
 */
export class UnimplementedError extends Error {
	constructor(method: string, className: string) {
		super(`${className}.${method}() is not implemented`)
		this.name = "UnimplementedError"
	}
}

/**
 * How path segments map to org/project.
 * Subclasses define this to control flat vs nested orgs.
 */
export interface PathSplit {
	org: string
	project: string
}

/**
 * Abstract base for providers bound to a known host (github.com, gitlab.com, tangled.org).
 *
 * Provides the full `candidates()` template method — three input branches
 * (SSH, URL, shorthand) that all reduce to `splitPath()` + context construction.
 * Subclasses implement:
 * - `splitPath()` — how path segments become org/project
 * - `verify()` — host-specific repo existence check
 * - Optional `resolveWikiRepo()` — wiki URL resolution
 *
 * Subclasses may guard `candidates()` branches by overriding individual
 * methods like `parseSshInput()`, `parseUrlInput()`, or `parseShorthandInput()`.
 */
export abstract class HostRepo implements Repo {
	abstract name: string
	abstract hosts: string[]

	/**
	 * Map path segments into org/project.
	 * Return `null` if the segments don't form a valid repo path.
	 */
	abstract splitPath(segments: string[]): PathSplit | null

	/**
	 * Verify that a candidate repo actually exists on this host.
	 * Yield the verified context, or yield nothing if verification fails.
	 */
	abstract verify(ctx: RepoContext, signal: AbortSignal): AsyncGenerator<RepoContext>

	/** Whether this provider produces candidates from SSH inputs. */
	get supportsSsh(): boolean {
		return true
	}

	toUrlString(ctx: RepoContext): string | undefined {
		if (!ctx.org || !ctx.project) return undefined
		return `https://${this.hosts[0]}/${ctx.org}/${ctx.project}`
	}

	async *candidates(input: string): AsyncGenerator<RepoContext> {
		const { trimmed, segments } = normalizeInput(input)

		if (isSsh(trimmed)) {
			if (!this.supportsSsh) return
			const parsed = parseSsh(trimmed)
			if (!parsed || !this.isMyHost(parsed.host)) return
			const parts = parsed.path.split("/").filter(Boolean)
			if (parts.length < 2) return
			const split = this.splitPath(parts)
			if (!split) return
			yield this.buildContext(split, "ssh")
			return
		}

		if (isUrl(trimmed)) {
			const parsed = parseUrl(trimmed)
			if (!parsed || !this.isMyHost(parsed.host)) return
			const urlSegments = parsed.pathname.split("/").filter(Boolean)
			if (urlSegments.length < 2) return
			const split = this.splitPath(urlSegments)
			if (!split) return
			yield this.buildContext(split, "url")
			return
		}

		if (segments.length >= 2 && this.isMyHost(segments[0]!)) {
			const rest = segments.slice(1)
			const split = this.splitPath(rest)
			if (!split) return
			yield this.buildContext(split, "shorthand-host-prefixed")
			return
		}

		if (segments.length >= 2 && !segments[0]!.includes(".")) {
			const split = this.splitPath(segments)
			if (!split) return
			yield this.buildContext(split, "shorthand-bare")
		}
	}

	resolveWikiRepo?(ctx: RepoContext): void

	protected isMyHost(host: string): boolean {
		return this.hosts.includes(host)
	}

	protected buildContext(split: PathSplit, _source: string): RepoContext {
		const ctx = new DefaultRepoContext()
		ctx.org = split.org
		ctx.project = split.project
		ctx.host = this.hosts[0]
		ctx.url = new URL(this.toUrlString(ctx)!)
		ctx.source.provider = this.name
		return ctx
	}
}
