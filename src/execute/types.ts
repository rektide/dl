import type { FlowEvent, FlowGoal } from "../flow/types.ts"
import type { InputEntry, InputStream } from "../input/types.ts"
import type { ProviderRegistry } from "../provider/types.ts"

export type ExecuteOptionsShape = {
	goal: FlowGoal
	timeoutMs: number
	continueOnError: boolean
}

export type ExecuteOptions = Readonly<ExecuteOptionsShape>

export type ExecuteContextShape = {
	registry: ProviderRegistry
	options: ExecuteOptions
	signal: AbortSignal
}

export type ExecuteContext = Readonly<ExecuteContextShape>

export type FlowExecutorRunShape<TIn, TEvent, TContext> = (
	inputs: AsyncIterable<TIn>,
	ctx: TContext,
) => AsyncGenerator<TEvent>

export type FlowExecutorRun<TIn, TEvent, TContext> = FlowExecutorRunShape<
	TIn,
	TEvent,
	TContext
>

export type InputFlowExecutorRun = FlowExecutorRun<InputEntry, FlowEvent, ExecuteContext>

export type FlowExecutorShape<TIn, TEvent, TContext> = {
	run: FlowExecutorRun<TIn, TEvent, TContext>
}

export type FlowExecutor<TIn, TEvent, TContext> = Readonly<
	FlowExecutorShape<TIn, TEvent, TContext>
>

export type InputFlowExecutor = FlowExecutor<InputEntry, FlowEvent, ExecuteContext>

export type FanInShape<TItem> = (
	sources: ReadonlyArray<AsyncIterable<TItem>>,
	signal?: AbortSignal,
) => AsyncIterable<TItem>

export type FanIn<TItem> = FanInShape<TItem>

export type InputFanIn = (
	sources: ReadonlyArray<InputStream>,
	signal?: AbortSignal,
) => InputStream
