// pattern: Functional Core

type NextValue<TItem> = {
	index: number
	result: IteratorResult<TItem>
}

const ABORTED = Symbol("aborted")
type Aborted = typeof ABORTED

function makeAbortPromise(signal: AbortSignal): {
	promise: Promise<Aborted>
	dispose: () => void
} {
	if (signal.aborted) {
		return {
			promise: Promise.resolve(ABORTED),
			dispose: () => {},
		}
	}

	let listener: (() => void) | null = null
	const promise = new Promise<Aborted>((resolve) => {
		listener = () => resolve(ABORTED)
		signal.addEventListener("abort", listener, { once: true })
	})

	return {
		promise,
		dispose: () => {
			if (!listener) return
			signal.removeEventListener("abort", listener)
			listener = null
		},
	}
}

function queueNext<TItem>(
	iterator: AsyncIterator<TItem>,
	index: number,
): Promise<NextValue<TItem>> {
	return iterator.next().then((result) => ({ index, result }))
}

async function raceNext<TItem>(
	pending: ReadonlyArray<Promise<NextValue<TItem>>>,
	abortPromise?: Promise<Aborted>,
): Promise<NextValue<TItem> | Aborted> {
	if (!abortPromise) return Promise.race(pending)
	return Promise.race([...pending, abortPromise])
}

export async function* fanIn<TItem>(
	sources: ReadonlyArray<AsyncIterable<TItem>>,
	signal?: AbortSignal,
): AsyncGenerator<TItem> {
	const iterators = sources.map((source) => source[Symbol.asyncIterator]())
	const pending = new Map<number, Promise<NextValue<TItem>>>()

	for (const [index, iterator] of iterators.entries()) {
		pending.set(index, queueNext(iterator, index))
	}

	const abort = signal ? makeAbortPromise(signal) : null

	try {
		while (pending.size > 0) {
			if (signal?.aborted) return

			const next = await raceNext(
				Array.from(pending.values()),
				abort?.promise,
			)

			if (next === ABORTED) return

			const { index, result } = next
			if (result.done) {
				pending.delete(index)
				continue
			}

			pending.set(index, queueNext(iterators[index]!, index))
			yield result.value
		}
	} finally {
		abort?.dispose()

		await Promise.allSettled(
			iterators.map(async (iterator) => {
				if (!iterator.return) return
				await iterator.return()
			}),
		)
	}
}
