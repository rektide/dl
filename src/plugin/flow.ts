import { plugin } from "gunshi/plugin"
import { FLOW_GOAL, type FlowEvent, type FlowGoal } from "../flow/types.ts"
import { createInputFlowExecutor } from "../execute/executor.ts"
import { RESOLVE_TIMEOUT } from "../repo/util.ts"
import { createProviderRegistry } from "../provider/registry.ts"
import { adaptLegacyProvider } from "../provider/adapt-legacy.ts"
import { githubProvider } from "../provider/github.ts"
import { gitlabProvider } from "../provider/gitlab.ts"
import { tangledProvider } from "../provider/tangled.ts"
import { cratesIoProvider } from "../repo/provider/crates-io.ts"
import { docsRsProvider } from "../repo/provider/docs-rs.ts"
import { genericProvider } from "../repo/provider/generic.ts"
import { npmxDevProvider } from "../repo/provider/npmx-dev.ts"
import { githubioProvider } from "../repo/provider/githubio.ts"

export const FLOW_PLUGIN_ID = "rekon:flow" as const

export type FlowResolveOptionsShape = {
	verify: boolean
	goal: FlowGoal
	continueOnError: boolean
	timeoutMs: number
}

export type FlowResolveOptions = Readonly<FlowResolveOptionsShape>

export interface FlowExtension {
	resolveStream(inputs: AsyncIterable<string>, options?: Partial<FlowResolveOptions>): AsyncGenerator<FlowEvent>
}

function defaultResolveOptions(): FlowResolveOptions {
	return {
		verify: true,
		goal: FLOW_GOAL.firstSuccess,
		continueOnError: true,
		timeoutMs: RESOLVE_TIMEOUT,
	}
}

async function* toInputEntries(inputs: AsyncIterable<string>) {
	for await (const value of inputs) {
		yield { value, source: "input" }
	}
}

export const flowPlugin = plugin({
	id: FLOW_PLUGIN_ID,
	name: "Rekon Flow",
	extension: (): FlowExtension => {
		const registry = createProviderRegistry([
			githubProvider,
			gitlabProvider,
			tangledProvider,
			adaptLegacyProvider(cratesIoProvider),
			adaptLegacyProvider(docsRsProvider),
			adaptLegacyProvider(npmxDevProvider),
			adaptLegacyProvider(githubioProvider),
			adaptLegacyProvider(genericProvider),
		])
		const execute = createInputFlowExecutor()

		async function* resolveStream(
			inputs: AsyncIterable<string>,
			overrides: Partial<FlowResolveOptions> = {},
		): AsyncGenerator<FlowEvent> {
			const options = {
				...defaultResolveOptions(),
				...overrides,
			}
			const signal = AbortSignal.timeout(options.timeoutMs)

			yield* execute(toInputEntries(inputs), {
				registry,
				options,
				signal,
			})
		}

		return { resolveStream }
	},
})
