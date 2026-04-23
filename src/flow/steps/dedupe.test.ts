import { describe, expect, test } from "vitest"
import { FLOW_GOAL, REPO_STATE, type FlowContext, type Repo } from "../types.ts"
import { dedupeRepos } from "./dedupe.ts"

async function* fromArray<TItem>(items: ReadonlyArray<TItem>): AsyncGenerator<TItem> {
	for (const item of items) {
		yield item
	}
}

function makeRepo(url: string, producedBy: string): Repo {
	return {
		id: `${producedBy}:${url}`,
		input: "input",
		url: new URL(url),
		inputUrl: new URL(url),
		host: new URL(url).host,
		org: "org",
		project: "repo",
		state: REPO_STATE.candidate,
		producedBy,
		verifiedBy: new Set<string>(),
	}
}

function createContext(): FlowContext {
	return {
		signal: AbortSignal.timeout(1000),
		goal: FLOW_GOAL.firstSuccess,
		dedupe: new Set<string>(),
		now: () => new Date(),
	}
}

describe("dedupeRepos", () => {
	test("removes duplicate repos by URL identity", async () => {
		const input = fromArray([
			makeRepo("https://github.com/org/repo", "github"),
			makeRepo("https://github.com/org/repo", "gitlab"),
			makeRepo("https://gitlab.com/org/repo", "gitlab"),
		])

		const output: Array<Repo> = []
		for await (const repo of dedupeRepos(input, createContext())) {
			output.push(repo)
		}

		expect(output.map((repo) => repo.url.toString())).toEqual([
			"https://github.com/org/repo",
			"https://gitlab.com/org/repo",
		])
	})
})
