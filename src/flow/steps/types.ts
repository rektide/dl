import type { Repo, RepoIdentity, RepoStep, RepoStream } from "../types.ts"

export type StepFactory<I extends Repo = Repo, O extends Repo = Repo> =
	(name: string) => RepoStep<I, O>

export type DedupeStepOptions = Readonly<{
	identity: RepoIdentity
}>

export type VerifyStepOptions = Readonly<{
	continueOnError: boolean
}>

export type CandidateStep = RepoStep<Repo, Repo>
export type VerifyStep = RepoStep<Repo, Repo>

export type StepResult<TRepo extends Repo = Repo> = Readonly<{
	step: string
	stream: RepoStream<TRepo>
}>
