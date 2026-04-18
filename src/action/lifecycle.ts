import type { RepoContext } from "../repo/context.ts"

export type LifecycleStep =
	| "archlist"
	| "archive"
	| "archive-jj"
	| "symlink-org"
	| "symlink-repo"
	| "wiki-dexport"
	| "wiki-git"
	| "pipeline"

export type LifecycleStatus = "ok" | "skipped" | "failed"

export type LifecycleRecord = {
	readonly step: LifecycleStep
	readonly source: string
	readonly status: LifecycleStatus
	readonly transition: string
	readonly details: Readonly<Record<string, unknown>>
}

export type LifecycleSummary = {
	readonly repoUrl: string | null
	readonly hadError: boolean
	readonly records: ReadonlyArray<LifecycleRecord>
}

type LifecycleRecordInput = {
	readonly step: LifecycleStep
	readonly source: string
	readonly status: LifecycleStatus
	readonly transition: string
	readonly details?: Readonly<Record<string, unknown>>
}

export type LifecycleReporter = {
	ok: (input: Omit<LifecycleRecordInput, "status">) => void
	skipped: (input: Omit<LifecycleRecordInput, "status">) => void
	failed: (input: Omit<LifecycleRecordInput, "status">) => void
	summary: (hadError: boolean) => LifecycleSummary
}

export function createLifecycleReporter(resolved: RepoContext): LifecycleReporter {
	const records: Array<LifecycleRecord> = []
	const repoUrl = resolved.url?.toString() ?? null

	const record = (input: LifecycleRecordInput) => {
		records.push({
			step: input.step,
			source: input.source,
			status: input.status,
			transition: input.transition,
			details: input.details ?? {},
		})
	}

	return {
		ok: (input) => record({ ...input, status: "ok" }),
		skipped: (input) => record({ ...input, status: "skipped" }),
		failed: (input) => record({ ...input, status: "failed" }),
		summary: (hadError: boolean) => ({
			repoUrl,
			hadError,
			records,
		}),
	}
}
