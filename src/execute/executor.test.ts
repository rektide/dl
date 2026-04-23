import { describe, expect, test } from "vitest"
import { FLOW_GOAL, REPO_STATE, type Repo } from "../flow/types.ts"
import type { InputEntry } from "../input/types.ts"
import { createProviderRegistry } from "../provider/registry.ts"
import type { Provider } from "../provider/types.ts"
import { createInputFlowExecutor } from "./executor.ts"
import type { ExecuteContext } from "./types.ts"

async function* oneInput(value: string): AsyncGenerator<InputEntry> {
	yield { value, source: "test" }
}

async function* oneRepo(repo: Repo): AsyncGenerator<Repo> {
	yield repo
}

function makeRepo(input: string, url: string, producedBy: string): Repo {
	const parsed = new URL(url)
	const segments = parsed.pathname.split("/").filter(Boolean)
	return {
		id: `${producedBy}:${url}`,
		input,
		url: parsed,
		inputUrl: parsed,
		host: parsed.host,
		org: segments.slice(0, -1).join("/") || null,
		project: segments.at(-1) ?? null,
		state: REPO_STATE.candidate,
		producedBy,
		verifiedBy: new Set<string>(),
	}
}

function makeProvider(
	name: string,
	candidateFactory: (input: string) => AsyncGenerator<Repo>,
	verifyFn: Provider["verify"],
): Provider {
	return {
		name,
		hosts: ["github.com", "tangled.org"],
		candidates: candidateFactory,
		verify: verifyFn,
	}
}

function makeContext(providers: ReadonlyArray<Provider>, verify = true): ExecuteContext {
	return {
		registry: createProviderRegistry(providers),
		options: {
			goal: FLOW_GOAL.firstSuccess,
			timeoutMs: 2000,
			continueOnError: true,
			verify,
		},
		signal: AbortSignal.timeout(2000),
	}
}

describe("createInputFlowExecutor", () => {
	test("tries multiple providers and emits miss + verified", async () => {
		const input = "mary.my.id/atcute"
		const github = makeProvider(
			"github",
			() => oneRepo(makeRepo(input, "https://github.com/mary.my.id/atcute", "github")),
			async () => null,
		)
		const tangled = makeProvider(
			"tangled",
			() => oneRepo(makeRepo(input, "https://tangled.org/mary.my.id/atcute", "tangled")),
			async (repo) => ({ ...repo, state: REPO_STATE.verified }),
		)

		const executor = createInputFlowExecutor()
		const events = []
		for await (const event of executor(oneInput(input), makeContext([github, tangled], true))) {
			events.push(event)
		}

		expect(events.some((event) => event.type === "miss" && event.provider === "github")).toBe(
			true,
		)
		expect(
			events.some(
				(event) => event.type === "verified" && event.repo.producedBy === "tangled",
			),
		).toBe(true)
	})

	test("does not call verify when verify option is false", async () => {
		let verifyCalls = 0
		const provider = makeProvider(
			"github",
			() => oneRepo(makeRepo("org/repo", "https://github.com/org/repo", "github")),
			async () => {
				verifyCalls += 1
				return null
			},
		)

		const executor = createInputFlowExecutor()
		const events = []
		for await (const event of executor(oneInput("org/repo"), makeContext([provider], false))) {
			events.push(event)
		}

		expect(events).toHaveLength(1)
		expect(events[0]?.type).toBe("candidate")
		expect(verifyCalls).toBe(0)
	})

	test("dedupes equal candidate urls from multiple providers", async () => {
		const input = "org/repo"
		const github = makeProvider(
			"github",
			() => oneRepo(makeRepo(input, "https://github.com/org/repo", "github")),
			async () => null,
		)
		const mirror = makeProvider(
			"mirror",
			() => oneRepo(makeRepo(input, "https://github.com/org/repo", "mirror")),
			async () => null,
		)

		const executor = createInputFlowExecutor()
		const events = []
		for await (const event of executor(oneInput(input), makeContext([github, mirror], false))) {
			events.push(event)
		}

		const candidates = events.filter((event) => event.type === "candidate")
		expect(candidates).toHaveLength(1)
	})
})
