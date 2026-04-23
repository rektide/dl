// pattern: Imperative Shell

import type { FlowContext, Repo } from "../flow/types.ts"
import { dedupeRepos } from "../flow/steps/dedupe.ts"
import { verifyRepos } from "../flow/steps/verify.ts"
import type { InputEntry } from "../input/types.ts"
import { PROVIDER_LOOKUP_MODE } from "../provider/types.ts"
import { fanIn } from "./fan-in.ts"
import { runStages, type Stage } from "./stage.ts"
import type {
	ExecuteContext,
	FanIn,
	InputFlowExecutor,
} from "./types.ts"

function createFlowContext(ctx: ExecuteContext): FlowContext {
	return {
		signal: ctx.signal,
		goal: ctx.options.goal,
		dedupe: new Set<string>(),
		now: () => new Date(),
		plugins: ctx.plugins,
	}
}

function dedupeStage(input: AsyncIterable<Repo>, context: FlowContext): AsyncIterable<Repo> {
	return dedupeRepos(input, context)
}

function verifyStage(
	registry: ExecuteContext["registry"],
	continueOnError: boolean,
): Stage<Repo, FlowContext> {
	return async function* runVerify(input, context): AsyncGenerator<Repo> {
		for await (const attempt of verifyRepos(input, context, registry, continueOnError)) {
			if (!attempt.repo) continue
			yield attempt.repo
		}
	}
}

export function createInputFlowExecutor(merge: FanIn<Repo> = fanIn): InputFlowExecutor {
	return async function* execute(
		inputs: AsyncIterable<InputEntry>,
		ctx: ExecuteContext,
	): AsyncGenerator<Repo> {
		for await (const input of inputs) {
			const providers = ctx.registry.lookup(input.value, {
				mode: PROVIDER_LOOKUP_MODE.candidate,
				repo: null,
			})

			const candidateStreams = providers.map((provider) => provider.candidates(input.value))
			const flowCtx = createFlowContext(ctx)
			const source = merge(candidateStreams, ctx.signal)
			const stages: Array<Stage<Repo, FlowContext>> = [dedupeStage, ...ctx.proposedStages]
			if (ctx.options.verify) {
				stages.push(verifyStage(ctx.registry, ctx.options.continueOnError))
				stages.push(...ctx.verifiedStages)
			}

			yield* runStages(source, stages, flowCtx)
		}
	}
}
