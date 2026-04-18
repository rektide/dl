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
