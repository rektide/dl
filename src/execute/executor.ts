// pattern: Imperative Shell

import type { FlowContext, FlowEvent, Repo } from "../flow/types.ts"
import { createDedupeStep } from "../flow/steps/dedupe.ts"
import { createVerifyStep } from "../flow/steps/verify.ts"
import type { InputEntry } from "../input/types.ts"
import { PROVIDER_LOOKUP_MODE } from "../provider/types.ts"
import { fanIn } from "./fan-in.ts"
import type {
	ExecuteContext,
	FanIn,
	InputFlowExecutor,
} from "./types.ts"

async function* one<TItem>(value: TItem): AsyncGenerator<TItem> {
	yield value
}

function createFlowContext(ctx: ExecuteContext): FlowContext {
	return {
		signal: ctx.signal,
		goal: ctx.options.goal,
		dedupe: new Set<string>(),
		now: () => new Date(),
	}
}

export function createInputFlowExecutor(merge: FanIn<Repo> = fanIn): InputFlowExecutor {
	return async function* execute(
		inputs: AsyncIterable<InputEntry>,
		ctx: ExecuteContext,
	): AsyncGenerator<FlowEvent> {
		const dedupe = createDedupeStep()
		const verify = createVerifyStep(ctx.registry, ctx.options.continueOnError)

		for await (const input of inputs) {
			const providers = ctx.registry.lookup(input.value, {
				mode: PROVIDER_LOOKUP_MODE.candidate,
				repo: null,
			})

			const candidateStreams = providers.map((provider) => provider.candidates(input.value))
			const flowCtx = createFlowContext(ctx)
			const candidates = dedupe.run(merge(candidateStreams, ctx.signal), flowCtx)

			for await (const candidate of candidates) {
				yield { type: "candidate", repo: candidate }

				if (!ctx.options.verify) {
					continue
				}

				const attempts = verify.run(one(candidate), flowCtx)
				for await (const attempt of attempts) {
					if (attempt.error) {
						yield {
							type: "error",
							input: input.value,
							provider: attempt.provider,
							message: attempt.error.message,
						}
						continue
					}

					if (!attempt.repo) {
						yield {
							type: "miss",
							input: input.value,
							provider: attempt.provider,
							url: attempt.candidate.url,
						}
						continue
					}

					yield {
						type: "verified",
						repo: attempt.repo,
					}
				}
			}
		}
	}
}
