// pattern: Functional Core

export type Stage<TItem, TContext> = (
	input: AsyncIterable<TItem>,
	context: TContext,
) => AsyncIterable<TItem>

export function runStages<TItem, TContext>(
	input: AsyncIterable<TItem>,
	stages: ReadonlyArray<Stage<TItem, TContext>>,
	context: TContext,
): AsyncIterable<TItem> {
	let current: AsyncIterable<TItem> = input
	for (const stage of stages) {
		current = stage(current, context)
	}
	return current
}
