import { describe, expect, test } from "vitest"
import { processRepoContext } from "./run.ts"
import type { DlContext, DlOptions } from "../action/types.ts"
import type { GitOps } from "../git/types.ts"
import { ENSURE, OFF } from "../action/state.ts"
import type { LogEvent, LogExtension } from "../plugin/log.ts"
import type { RepoContext } from "../repo/context.ts"
import { archiveHandler } from "../archive/handler.ts"
import { wikiHandler } from "../wiki/handler.ts"
import { deepwikiHandler } from "../deepwiki/handler.ts"
import { archlistHandler } from "../archlist/handler.ts"
import { symlinkHandler } from "../symlink/handler.ts"
import type { DexportOps } from "../dexport/types.ts"

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
		archiveState: ENSURE,
		wikiState: OFF,
		deepwikiState: OFF,
		archlistState: OFF,
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

		const ctx: DlContext = {
			roots: { archiveRoot: "/tmp/archive", wikiRoot: "/tmp/wiki" },
			options: createOptions({ deepwikiState: ENSURE }),
			log,
			gitOps,
			dexportOps,
		}

		const handlers = [archlistHandler, archiveHandler, symlinkHandler, deepwikiHandler, wikiHandler]
		const hadError = await processRepoContext(createResolved(), ctx, handlers)
		expect(hadError).toBe(true)

		const reportEvent = events.find((event) => event.event === "lifecycle_report")
		expect(reportEvent).toBeDefined()
		expect(reportEvent?.data.hadError).toBe(true)

		const records = (reportEvent?.data.records ?? []) as Array<{ step: string; status: string }>
		expect(records.some((record) => record.step === "archive" && record.status === "failed")).toBe(true)
	})

	test("treats wiki soft failures as non-fatal while recording failure status", async () => {
		const { events, log } = createLog()
		const gitOps: GitOps = {
			cloneOrUpdate: async () => "updated",
			ensureJjInitialized: async () => "already_initialized",
			listRemotes: async () => [],
			normalizeCloneUrl: (url) => url,
		}

		const dexportOps: DexportOps = {
			sync: async () => ({ plan: "run", status: "failed", reason: "dexport failed" }),
		}

		const ctx: DlContext = {
			roots: { archiveRoot: "/tmp/archive", wikiRoot: "/tmp/wiki" },
			options: createOptions({ archiveState: OFF, wikiState: OFF, deepwikiState: ENSURE }),
			log,
			gitOps,
			dexportOps,
		}

		const handlers = [archlistHandler, archiveHandler, symlinkHandler, deepwikiHandler, wikiHandler]
		const hadError = await processRepoContext(createResolved(), ctx, handlers)
		expect(hadError).toBe(true)

		const reportEvent = events.find((event) => event.event === "lifecycle_report")
		const records = (reportEvent?.data.records ?? []) as Array<{ step: string; status: string }>
		expect(records.some((record) => record.step === "wiki-dexport" && record.status === "failed")).toBe(true)
	})
})
