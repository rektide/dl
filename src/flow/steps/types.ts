import type { Repo, RepoIdentity, RepoStep } from "../types.ts"

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
