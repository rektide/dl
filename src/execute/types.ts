import type { FlowEvent, FlowGoal } from "../flow/types.ts"
import type { InputStream } from "../input/types.ts"
import type { Provider } from "../provider/types.ts"

export type ExecuteOptionsShape = {
	goal: FlowGoal
	timeoutMs: number
	continueOnError: boolean
}

export type ExecuteOptions = Readonly<ExecuteOptionsShape>

export type ExecuteContextShape = {
	providers: ReadonlyArray<Provider>
	options: ExecuteOptions
	signal: AbortSignal
}

export type ExecuteContext = Readonly<ExecuteContextShape>

export type FlowExecutorRun = (
	inputs: InputStream,
	ctx: ExecuteContext,
) => AsyncGenerator<FlowEvent>

export type FlowExecutorShape = {
	run: FlowExecutorRun
}

export type FlowExecutor = Readonly<FlowExecutorShape>

export type FanIn = (
	sources: ReadonlyArray<InputStream>,
	signal?: AbortSignal,
) => InputStream
