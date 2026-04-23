import { describe, expect, test } from "vitest"
import { createProviderRegistry } from "../../provider/registry.ts"
import { FLOW_GOAL, REPO_STATE, type FlowContext, type FlowGoal, type Repo } from "../types.ts"
import { verifyRepos } from "./verify.ts"
import type { Provider } from "../../provider/types.ts"

async function* one<TItem>(value: TItem): AsyncGenerator<TItem> {
	yield value
}

function makeRepo(producedBy: string): Repo {
	return {
		id: `${producedBy}:repo`,
		input: "org/repo",
		url: new URL("https://github.com/org/repo"),
		inputUrl: new URL("https://github.com/org/repo"),
		host: "github.com",
		org: "org",
		project: "repo",
		state: REPO_STATE.candidate,
		producedBy,
		verifiedBy: new Set<string>(),
	}
}

function makeContext(goal: FlowGoal = FLOW_GOAL.firstSuccess): FlowContext {
	return {
		signal: AbortSignal.timeout(1000),
		goal,
		dedupe: new Set<string>(),
		now: () => new Date(),
		plugins: {
			flow: {
				input: () => {},
			},
		},
	}
}

function makeProvider(
	name: string,
	verifyFn: Provider["verify"],
	hosts: ReadonlyArray<string> = ["github.com"],
): Provider {
	return {
		name,
		hosts,
		async *candidates() {},
		verify: verifyFn,
	}
}

describe("verifyRepos", () => {
	test("verifies producer first regardless of registry order", async () => {
		const order: Array<string> = []
		const producer = makeProvider("producer", async (repo) => {
			order.push("producer")
			return { ...repo, state: REPO_STATE.verified }
		})
		const other = makeProvider("other", async (repo) => {
			order.push("other")
			return { ...repo, state: REPO_STATE.verified }
		})

		const registry = createProviderRegistry([other, producer])
		const attempts = []
		for await (const attempt of verifyRepos(one(makeRepo("producer")), makeContext(), registry, true)) {
			attempts.push(attempt)
		}

		expect(order).toEqual(["producer"])
		expect(attempts).toHaveLength(1)
		expect(attempts[0]?.repo?.state).toBe(REPO_STATE.verified)
	})

	test("yields provider error and does not fallback when continueOnError=true", async () => {
		const failing = makeProvider("failing", async () => {
			throw new Error("boom")
		})
		const succeeding = makeProvider("succeeding", async (repo) => {
			return { ...repo, state: REPO_STATE.verified }
		})
		const registry = createProviderRegistry([failing, succeeding])
		const attempts = []
		for await (const attempt of verifyRepos(
			one(makeRepo("failing")),
			makeContext(FLOW_GOAL.allSuccesses),
			registry,
			true,
		)) {
			attempts.push(attempt)
		}

		expect(attempts).toHaveLength(1)
		expect(attempts[0]?.error?.message).toBe("boom")
	})

	test("throws on provider error when continueOnError=false", async () => {
		const failing = makeProvider("failing", async () => {
			throw new Error("stop")
		})
		const registry = createProviderRegistry([failing])
		await expect(async () => {
			for await (const _attempt of verifyRepos(one(makeRepo("failing")), makeContext(), registry, false)) {
				// consume
			}
		}).rejects.toThrow("stop")
	})
})
