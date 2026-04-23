// pattern: Functional Core

import { REPO_STATE, type FlowContext, type Repo } from "../types.ts"
import type { Provider, ProviderRegistry } from "../../provider/types.ts"

export type VerifyAttemptShape = {
	input: string
	provider: string
	candidate: Repo
	repo: Repo | null
	error: Error | null
}

export type VerifyAttempt = Readonly<VerifyAttemptShape>

function toError(error: unknown): Error {
	if (error instanceof Error) return error
	return new Error(String(error))
}

function normalizeVerified(candidate: Repo, provider: Provider, verified: Repo): Repo {
	return {
		...verified,
		id: verified.id || candidate.id,
		input: candidate.input,
		inputUrl: candidate.inputUrl,
		producedBy: candidate.producedBy,
		state: REPO_STATE.verified,
		verifiedBy: new Set([...candidate.verifiedBy, ...verified.verifiedBy, provider.name]),
	}
}

export async function* verifyRepos(
	input: AsyncIterable<Repo>,
	ctx: FlowContext,
	registry: ProviderRegistry,
	continueOnError: boolean,
): AsyncGenerator<VerifyAttempt> {
	for await (const candidate of input) {
		const provider = registry.byName.get(candidate.producedBy)
		if (!provider) {
			const error = new Error(`unknown producer provider: ${candidate.producedBy}`)
			yield {
				input: candidate.input,
				provider: candidate.producedBy,
				candidate,
				repo: null,
				error,
			}
			if (!continueOnError) {
				throw error
			}
			continue
		}

		try {
			const verified = await provider.verify(candidate, ctx.signal)
			if (!verified) {
				yield {
					input: candidate.input,
					provider: provider.name,
					candidate,
					repo: null,
					error: null,
				}
				continue
			}

			yield {
				input: candidate.input,
				provider: provider.name,
				candidate,
				repo: normalizeVerified(candidate, provider, verified),
				error: null,
			}
		} catch (error) {
			const normalized = toError(error)
			yield {
				input: candidate.input,
				provider: provider.name,
				candidate,
				repo: null,
				error: normalized,
			}
			if (!continueOnError) {
				throw normalized
			}
		}
	}
}
