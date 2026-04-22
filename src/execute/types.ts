import type { FlowEvent, FlowGoal } from "../flow/types.ts"
import type { InputStream } from "../input/types.ts"
import type { Provider } from "../provider/types.ts"

export type ExecuteOptions = Readonly<{
	goal: FlowGoal
	timeoutMs: number
	continueOnError: boolean
}>

export type ExecuteContext = Readonly<{
	providers: ReadonlyArray<Provider>
	options: ExecuteOptions
	signal: AbortSignal
}>

export type FlowExecutor = Readonly<{
	run(inputs: InputStream, ctx: ExecuteContext): AsyncGenerator<FlowEvent>
}>

export type FanIn = (
	sources: ReadonlyArray<InputStream>,
	signal?: AbortSignal,
) => InputStream
