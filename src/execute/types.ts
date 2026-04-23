import type {
	FlowContext,
	FlowGoal,
	FlowPlugins,
	Repo,
} from "../flow/types.ts"
import type { InputEntry, InputStream } from "../input/types.ts"
import type { ProviderRegistry } from "../provider/types.ts"
import type { Stage } from "./stage.ts"

export type ExecuteOptionsShape = {
	goal: FlowGoal
	timeoutMs: number
	continueOnError: boolean
	verify: boolean
}

export type ExecuteOptions = Readonly<ExecuteOptionsShape>

export type ExecuteContextShape = {
	registry: ProviderRegistry
	options: ExecuteOptions
	signal: AbortSignal
	plugins: FlowPlugins
	proposedStages: ReadonlyArray<Stage<Repo, FlowContext>>
	verifiedStages: ReadonlyArray<Stage<Repo, FlowContext>>
}

export type ExecuteContext = Readonly<ExecuteContextShape>

export type FlowExecutor<TIn, TEvent, TContext> = (
	inputs: AsyncIterable<TIn>,
	ctx: TContext,
) => AsyncGenerator<TEvent>

export type InputFlowExecutor = FlowExecutor<InputEntry, Repo, ExecuteContext>

export type FanIn<TItem> = (
	sources: ReadonlyArray<AsyncIterable<TItem>>,
	signal?: AbortSignal,
) => AsyncIterable<TItem>

export type InputFanIn = (
	sources: ReadonlyArray<InputStream>,
	signal?: AbortSignal,
) => InputStream
