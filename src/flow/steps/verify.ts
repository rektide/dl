// pattern: Functional Core

import { FLOW_GOAL, REPO_STATE, type FlowContext, type Repo } from "../types.ts"
import { PROVIDER_LOOKUP_MODE, type Provider, type ProviderRegistry } from "../../provider/types.ts"

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

function orderProviders(candidate: Repo, registry: ProviderRegistry): ReadonlyArray<Provider> {
	const providers = registry.lookup(candidate.input, {
		mode: PROVIDER_LOOKUP_MODE.verify,
		repo: candidate,
	})

	const ordered: Array<Provider> = []
	const seen = new Set<string>()
	const producer = registry.byName.get(candidate.producedBy)
	if (producer) {
		ordered.push(producer)
		seen.add(producer.name)
	}

	for (const provider of providers) {
		if (seen.has(provider.name)) continue
		seen.add(provider.name)
		ordered.push(provider)
	}

	return ordered
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
		const providers = orderProviders(candidate, registry)

		for (const provider of providers) {
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

				if (ctx.goal === FLOW_GOAL.firstSuccess) {
					break
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
}
