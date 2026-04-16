import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "./types.ts"
import type { LifecycleReporter } from "./lifecycle.ts"

export type ActionResult = {
	readonly hadError: boolean
}

export interface ActionHandler {
	readonly id: string
	readonly run: (resolved: RepoContext, ctx: DlContext, lifecycle: LifecycleReporter) => Promise<ActionResult>
}

export async function runPipeline(
	resolved: RepoContext,
	ctx: DlContext,
	handlers: readonly ActionHandler[],
	reportLifecycle: boolean,
	log: import("../plugin/log.ts").LogExtension,
): Promise<boolean> {
	const { createLifecycleReporter } = await import("./lifecycle.ts")
	const lifecycle = createLifecycleReporter(resolved)
	let hadError = false

	for (const handler of handlers) {
		try {
			const result = await handler.run(resolved, ctx, lifecycle)
			if (result.hadError) hadError = true
		} catch (error) {
			hadError = true
			const message = error instanceof Error ? error.message : String(error)
			log.error("sync", `${handler.id}_failed`, { message })
			lifecycle.failed({
				step: handler.id as any,
				source: handler.id,
				transition: "error",
				details: { message },
			})
		}
	}

	if (reportLifecycle) {
		log.info("sync", "lifecycle_report", lifecycle.summary(hadError))
	}

	return hadError
}
