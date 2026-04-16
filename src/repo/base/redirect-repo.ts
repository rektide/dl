import { DefaultRepoContext } from "../context.ts"
import type { RepoContext } from "../context.ts"
import type { Repo } from "../types.ts"
import { repoUrlToContext, ALL_CLEAN } from "../clean-url.ts"
import type { CleanUrlOptions } from "../clean-url.ts"

/**
 * Abstract base for redirect providers (crates.io, docs.rs, npm).
 *
 * These providers don't host repos — they accept a package/crate identifier,
 * perform an API lookup to discover the real repo URL on github/gitlab/etc,
 * and yield a RepoContext pointing to the resolved host.
 *
 * Subclasses implement:
 * - `extractIdentifier()` — parse the input to find a package/crate name
 * - `fetchRepoUrl()` — look up the real repo URL via the package registry API
 *
 * Optional overrides:
 * - `cleanRepoUrl()` — provider-specific URL cleaning before resolution
 */
export abstract class RedirectRepo implements Repo {
	abstract name: string
	abstract hosts: string[]

	toUrlString(): string | undefined {
		return undefined
	}

	/**
	 * Parse the input and extract a package/crate identifier.
	 * Return `undefined` if this input doesn't match this provider's URL scheme.
	 */
	abstract extractIdentifier(input: string): string | undefined

	/**
	 * Look up the real repo URL for the given identifier via a registry API.
	 * Return the raw repository URL string, or `undefined` on failure.
	 */
	abstract fetchRepoUrl(
		identifier: string,
		signal: AbortSignal,
	): Promise<string | undefined>

	/**
	 * Clean the raw URL before converting to a RepoContext.
	 * Subclasses may override to add provider-specific cleaning.
	 */
	protected cleanRawUrl(
		raw: string,
		options: CleanUrlOptions = ALL_CLEAN,
	): string {
		return raw
	}

	async *candidates(input: string): AsyncGenerator<RepoContext> {
		const id = this.extractIdentifier(input)
		if (!id) return

		const controller = new AbortController()
		const raw = await this.fetchRepoUrl(id, controller.signal).catch(
			() => undefined,
		)
		if (!raw) return

		const cleaned = this.cleanRawUrl(raw)
		const ctx = repoUrlToContext(cleaned, this.name)
		if (ctx) yield ctx
	}

	async *verify(
		_ctx: RepoContext,
		_signal: AbortSignal,
	): AsyncGenerator<RepoContext> {
		// redirect providers don't verify — the resolved host provider does
	}
}
