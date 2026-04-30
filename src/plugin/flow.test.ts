import { describe, expect, test } from "vitest"
import { FLOW_CHECKPOINT, REPO_STATE } from "../flow/types.ts"
import { type FlowExtension, flowPlugin } from "./flow.ts"

async function createFlow(): Promise<FlowExtension> {
	const core = { extensions: {} } as Parameters<
		typeof flowPlugin.extension.factory
	>[0]
	const command = {} as Parameters<typeof flowPlugin.extension.factory>[1]
	const extension = await flowPlugin.extension.factory(core, command)
	// Gunshi erases plugin extension generics here, but this test creates this exact plugin.
	return extension as unknown as FlowExtension
}

async function consume<TItem>(input: AsyncIterable<TItem>): Promise<Array<TItem>> {
	const output: Array<TItem> = []
	for await (const item of input) {
		output.push(item)
	}
	return output
}

describe("flowPlugin session snapshots", () => {
	test("tracks idle, configured, and completed phases for plan execution", async () => {
		const flow = await createFlow()
		const plan = flow.plan()

		expect(plan.snapshot().phase).toBe("idle")

		plan.config({ verify: false })
		expect(plan.snapshot().phase).toBe("configured")

		plan.push("serde-rs/serde")
		expect(plan.snapshot().queuedCount).toBe(1)

		const repos = await consume(plan.execute())
		expect(repos.length).toBeGreaterThan(0)
		expect(repos.every((repo) => repo.state === REPO_STATE.candidate)).toBe(true)

		const snapshot = plan.snapshot()
		expect(snapshot.phase).toBe("completed")
		expect(snapshot.queuedCount).toBe(0)
		expect(snapshot.startedAt).toBeInstanceOf(Date)
		expect(snapshot.endedAt).toBeInstanceOf(Date)
	})

	test("counts proposed checkpoint emissions", async () => {
		const flow = await createFlow()
		const plan = flow
			.plan()
			.config({ verify: false })
			.on(FLOW_CHECKPOINT.proposed, () => {})
			.push("serde-rs/serde")

		await consume(plan.execute())

		const snapshot = plan.snapshot()
		expect(snapshot.emittedProposed).toBeGreaterThan(0)
		expect(snapshot.emittedVerified).toBe(0)
	})

	test("singleton plan drives extension snapshot", async () => {
		const flow = await createFlow()
		const plan = flow.plan().singleton().config({ verify: false }).push("serde-rs/serde")

		expect(flow.snapshot().phase).toBe("configured")
		expect(flow.snapshot().queuedCount).toBe(1)

		await consume(plan.execute())

		expect(flow.snapshot().phase).toBe("completed")
		expect(flow.snapshot().queuedCount).toBe(0)
	})

	test("records failed terminal state and last error", async () => {
		const flow = await createFlow()
		const plan = flow
			.plan()
			.config({ verify: false })
			.on(FLOW_CHECKPOINT.proposed, () => {
				throw new Error("observer failed")
			})
			.push("serde-rs/serde")

		await expect(consume(plan.execute())).rejects.toThrow("observer failed")

		const snapshot = plan.snapshot()
		expect(snapshot.phase).toBe("failed")
		expect(snapshot.lastError?.message).toBe("observer failed")
	})
})
