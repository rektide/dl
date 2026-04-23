import { describe, expect, test } from "vitest"
import { fanIn } from "./fan-in.ts"

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function* delayedSource<TItem>(
	entries: ReadonlyArray<readonly [number, TItem]>,
): AsyncGenerator<TItem> {
	for (const [delayMs, value] of entries) {
		await sleep(delayMs)
		yield value
	}
}

describe("fanIn", () => {
	test("emits whichever source resolves first", async () => {
		const slow = delayedSource<string>([
			[30, "slow-1"],
			[30, "slow-2"],
		])
		const fast = delayedSource<string>([
			[5, "fast-1"],
			[5, "fast-2"],
		])

		const values: Array<string> = []
		for await (const value of fanIn([slow, fast])) {
			values.push(value)
		}

		expect(values).toEqual(["fast-1", "fast-2", "slow-1", "slow-2"])
	})

	test("handles empty source list", async () => {
		const values: Array<string> = []
		for await (const value of fanIn<string>([])) {
			values.push(value)
		}

		expect(values).toEqual([])
	})

	test("stops when aborted and closes active iterators", async () => {
		let closed = false

		async function* endless(): AsyncGenerator<number> {
			try {
				let current = 0
				while (true) {
					await sleep(5)
					yield current
					current += 1
				}
			} finally {
				closed = true
			}
		}

		const controller = new AbortController()
		const values: Array<number> = []

		for await (const value of fanIn([endless()], controller.signal)) {
			values.push(value)
			controller.abort()
		}

		expect(values).toHaveLength(1)
		expect(closed).toBe(true)
	})
})
