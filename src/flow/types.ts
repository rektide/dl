export const REPO_STATE = {
	candidate: "candidate",
	verified: "verified",
} as const

export type RepoState = (typeof REPO_STATE)[keyof typeof REPO_STATE]

export const FLOW_GOAL = {
	firstSuccess: "first-success",
	allSuccesses: "all-successes",
} as const

export type FlowGoal = (typeof FLOW_GOAL)[keyof typeof FLOW_GOAL]

export const FLOW_CHECKPOINT = {
	proposed: "proposed",
	verified: "verified",
} as const

export type FlowCheckpoint = (typeof FLOW_CHECKPOINT)[keyof typeof FLOW_CHECKPOINT]

export type FlowInput =
	| string
	| URL
	| AsyncIterable<string>
	| AsyncIterable<URL>
	| AsyncIterable<string | URL>

export type RepoShape = {
	id: string
	input: string
	url: URL
	inputUrl: URL | null
	host: string | null
	org: string | null
	project: string | null
	state: RepoState
	producedBy: string
	verifiedBy: ReadonlySet<string>
}

export type Repo = Readonly<RepoShape>

export type RepoStream<TRepo extends Repo = Repo> = AsyncIterable<TRepo>

export type FlowContextShape = {
	signal: AbortSignal
	goal: FlowGoal
	dedupe: Set<string>
	now: () => Date
	plugins: FlowPlugins
}

export type FlowContext = Readonly<FlowContextShape>

export type FlowRuntimePluginShape = {
	input: (input: FlowInput) => void
}

export type FlowRuntimePlugin = Readonly<FlowRuntimePluginShape>

export type FlowPlugins = Readonly<Record<string, unknown>> & {
	readonly flow: FlowRuntimePlugin
}

export type RepoIdentity = (repo: Repo) => string
