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

export type RepoStreamShape<TRepo extends Repo = Repo> = AsyncIterable<TRepo>

export type RepoStream<TRepo extends Repo = Repo> = RepoStreamShape<TRepo>

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

export type StepRun<TIn, TOut, TContext> = (
	input: AsyncIterable<TIn>,
	ctx: TContext,
) => AsyncIterable<TOut>

export type StepShape<TIn, TOut, TContext> = {
	name: string
	run: StepRun<TIn, TOut, TContext>
}

export type Step<TIn, TOut, TContext> = Readonly<StepShape<TIn, TOut, TContext>>

export type RepoStepRun<I extends Repo = Repo, O extends Repo = Repo> = (
	input: RepoStream<I>,
	ctx: FlowContext,
) => RepoStream<O>

export type RepoStepShape<I extends Repo = Repo, O extends Repo = Repo> = {
	name: string
	run: RepoStepRun<I, O>
}

export type RepoStep<I extends Repo = Repo, O extends Repo = Repo> = Readonly<
	RepoStepShape<I, O>
>

export type RepoIdentity = (repo: Repo) => string
