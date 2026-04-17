import { describe, expect, test } from "vitest"
import { processRepoContext } from "./index.ts"
import type { DlContext, DlOptions } from "./types.ts"
import type { DexportOps } from "../dexport/types.ts"
import type { GitOps } from "../git/types.ts"
import { OFF } from "./actions.ts"
import type { LogEvent, LogExtension } from "../plugin/log.ts"
import type { RepoContext } from "../repo/context.ts"

function createLog(): { events: Array<LogEvent>; log: LogExtension } {
	const events: Array<LogEvent> = []
	const push = (event: LogEvent) => {
		events.push(event)
	}

	return {
		events,
		log: {
			log: push,
			debug: (stage, event, data = {}) => push({ level: "debug", stage, event, data }),
			info: (stage, event, data = {}) => push({ level: "info", stage, event, data }),
			warn: (stage, event, data = {}) => push({ level: "warn", stage, event, data }),
			error: (stage, event, data = {}) => push({ level: "error", stage, event, data }),
			formatEvent: () => "",
			getOutputStdout: () => "ignore",
			getOutputStderr: () => "ignore",
		},
	}
}

function createOptions(overrides?: Partial<DlOptions>): DlOptions {
	return {
		consumeDexportOutput: false,
		noLogCache: false,
		reportLifecycle: true,
		doArchive: true,
		doWiki: false,
		archlistState: OFF,
		doSymlink: false,
		symlinkState: OFF,
		anycase: false,
		expand: false,
		dryRun: false,
		...overrides,
	}
}

function createResolved(): RepoContext {
	return {
		input: "org/repo",
		source: { provider: "github" },
		url: new URL("https://github.com/org/repo"),
		verified: true,
		wikiDeepUrl: new URL("https://deepwiki.com/org/repo"),
		wikiRepoUrl: new URL("https://github.com/org/repo.wiki.git"),
		project: "repo",
		org: "org",
	}
}

describe("processRepoContext", () => {
	test("isolates archive failure and still emits lifecycle report", async () => {
		const { events, log } = createLog()
		const ctx: DlContext = {
			roots: { archiveRoot: "/tmp/archive", wikiRoot: "/tmp/wiki" },
			options: createOptions(),
			log,
		}

		const gitOps: GitOps = {
			cloneOrUpdate: async () => {
				throw new Error("archive exploded")
			},
			ensureJjInitialized: async () => "already_initialized",
			listRemotes: async () => [],
			normalizeCloneUrl: (url) => url,
		}

		const dexportOps: DexportOps = {
			sync: async () => ({ plan: "run", status: "ran", reason: null }),
		}

		const hadError = await processRepoContext(createResolved(), ctx, gitOps, dexportOps)
		expect(hadError).toBe(true)

		const reportEvent = events.find((event) => event.event === "lifecycle_report")
		expect(reportEvent).toBeDefined()
		expect(reportEvent?.data.hadError).toBe(true)

		const records = (reportEvent?.data.records ?? []) as Array<{ step: string; status: string }>
		expect(records.some((record) => record.step === "archive" && record.status === "failed")).toBe(true)
		expect(records.some((record) => record.step === "wiki-dexport" && record.status === "skipped")).toBe(true)
	})

	test("treats wiki soft failures as non-fatal while recording failure status", async () => {
		const { events, log } = createLog()
		const ctx: DlContext = {
			roots: { archiveRoot: "/tmp/archive", wikiRoot: "/tmp/wiki" },
			options: createOptions({ doArchive: false, doWiki: true }),
			log,
		}

		const gitOps: GitOps = {
			cloneOrUpdate: async () => "updated",
			ensureJjInitialized: async () => "already_initialized",
			listRemotes: async () => [],
			normalizeCloneUrl: (url) => url,
		}

		const dexportOps: DexportOps = {
			sync: async () => ({ plan: "run", status: "failed", reason: "dexport failed" }),
		}

		const hadError = await processRepoContext(createResolved(), ctx, gitOps, dexportOps)
		expect(hadError).toBe(false)

		const reportEvent = events.find((event) => event.event === "lifecycle_report")
		const records = (reportEvent?.data.records ?? []) as Array<{ step: string; status: string }>
		expect(records.some((record) => record.step === "wiki-dexport" && record.status === "failed")).toBe(true)
	})
})
