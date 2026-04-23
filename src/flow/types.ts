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

export type FlowCandidateEvent = {
	type: "candidate"
	repo: Repo
}

export type FlowVerifiedEvent = {
	type: "verified"
	repo: Repo
}

export type FlowMissEvent = {
	type: "miss"
	input: string
	provider: string
	url: URL | null
}

export type FlowErrorEvent = {
	type: "error"
	input: string
	provider: string
	message: string
}

export type FlowEventShape =
	| FlowCandidateEvent
	| FlowVerifiedEvent
	| FlowMissEvent
	| FlowErrorEvent

export type FlowEvent = Readonly<FlowEventShape>

export type FlowContextShape = {
	signal: AbortSignal
	goal: FlowGoal
	dedupe: Set<string>
	now: () => Date
}

export type FlowContext = Readonly<FlowContextShape>

export type RepoIdentity = (repo: Repo) => string
