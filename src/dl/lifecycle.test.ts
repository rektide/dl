import { describe, expect, test } from "vitest"
import { createLifecycleReporter } from "./lifecycle.ts"
import type { RepoContext } from "../repo/context.ts"

function createResolved(url: string): RepoContext {
	return {
		input: url,
		source: { provider: "github" },
		url: new URL(url),
		verified: true,
		project: "repo",
		org: "org",
	}
}

describe("createLifecycleReporter", () => {
	test("records normalized step events", () => {
		const reporter = createLifecycleReporter(createResolved("https://github.com/org/repo"))

		reporter.ok({
			step: "archive",
			source: "syncArchive -> git.cloneOrUpdate",
			transition: "updated",
			details: { destination: "/tmp/archive/org/repo" },
		})
		reporter.skipped({
			step: "wiki-git",
			source: "syncWiki",
			transition: "not-applicable",
		})

		const summary = reporter.summary(false)

		expect(summary.repoUrl).toBe("https://github.com/org/repo")
		expect(summary.hadError).toBe(false)
		expect(summary.records).toEqual([
			{
				step: "archive",
				source: "syncArchive -> git.cloneOrUpdate",
				status: "ok",
				transition: "updated",
				details: { destination: "/tmp/archive/org/repo" },
			},
			{
				step: "wiki-git",
				source: "syncWiki",
				status: "skipped",
				transition: "not-applicable",
				details: {},
			},
		])
	})

	test("stores null repo URL when unresolved", () => {
		const reporter = createLifecycleReporter({
			input: "org/repo",
			source: { provider: undefined },
			verified: false,
			project: undefined,
			org: undefined,
		})

		reporter.failed({
			step: "pipeline",
			source: "processRepoContext",
			transition: "error",
			details: { message: "explode" },
		})

		const summary = reporter.summary(true)
		expect(summary.repoUrl).toBeNull()
		expect(summary.hadError).toBe(true)
		expect(summary.records).toHaveLength(1)
		expect(summary.records[0]?.status).toBe("failed")
	})
})
