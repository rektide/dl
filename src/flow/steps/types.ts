import type { Repo, RepoIdentity, RepoStep, RepoStream } from "../types.ts"

export type StepFactory<I extends Repo = Repo, O extends Repo = Repo> =
	(name: string) => RepoStep<I, O>

export type DedupeStepOptionsShape = {
	identity: RepoIdentity
}

export type DedupeStepOptions = Readonly<DedupeStepOptionsShape>

export type VerifyStepOptionsShape = {
	continueOnError: boolean
}

export type VerifyStepOptions = Readonly<VerifyStepOptionsShape>

export type CandidateStep = RepoStep<Repo, Repo>
export type VerifyStep = RepoStep<Repo, Repo>

export type StepResultShape<TRepo extends Repo = Repo> = {
	step: string
	stream: RepoStream<TRepo>
}

export type StepResult<TRepo extends Repo = Repo> = Readonly<StepResultShape<TRepo>>
