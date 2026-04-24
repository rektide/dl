import { describe, expect, test } from "vitest"
import {
	BUFFERED_QUEUE_EVENT,
	createBufferedAsyncQueue,
} from "./buffered-async-queue.ts"

async function collect<TItem>(iterable: AsyncIterable<TItem>): Promise<Array<TItem>> {
	const output: Array<TItem> = []
	for await (const item of iterable) {
		output.push(item)
	}
	return output
}

describe("createBufferedAsyncQueue", () => {
	test("bridges push-side input to async-iterable output", async () => {
		const queue = createBufferedAsyncQueue<string>()
		queue.push("a")
		queue.push("b")
		queue.close()

		const values = await collect(queue.values())
		expect(values).toEqual(["a", "b"])
	})

	test("emits highWaterMark and drain threshold events", async () => {
		const queue = createBufferedAsyncQueue<number>({ highWaterMark: 2 })
		const events: Array<string> = []

		queue.on(BUFFERED_QUEUE_EVENT.highWaterMark, () => {
			events.push("highWaterMark")
		})
		queue.on(BUFFERED_QUEUE_EVENT.drain, () => {
			events.push("drain")
		})

		queue.push(1)
		queue.push(2)

		const iterator = queue.values()[Symbol.asyncIterator]()
		await iterator.next()
		await iterator.next()
		queue.close()

		expect(events).toEqual(["highWaterMark", "drain"])
	})

	test("fails pending and future pulls when fail is called", async () => {
		const queue = createBufferedAsyncQueue<string>()
		const iterator = queue.values()[Symbol.asyncIterator]()

		const pending = iterator.next()
		queue.fail(new Error("boom"))

		await expect(pending).rejects.toThrow("boom")
		await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true })
	})

	test("rejects a second active consumer", async () => {
		const queue = createBufferedAsyncQueue<string>()
		const first = queue.values()[Symbol.asyncIterator]()
		const second = queue.values()[Symbol.asyncIterator]()

		void first.next()
		await expect(second.next()).rejects.toThrow("one active consumer")
		queue.close()
	})
})
