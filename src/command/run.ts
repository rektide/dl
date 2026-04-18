import { OFF } from "../action/state.ts"
import type { DlOptions, DlContext } from "../action/types.ts"
import type { ActionHandler } from "../action/handler.ts"
import type { DlActionSpec, DlActionToken } from "../action/registry.ts"
import { runPipeline } from "../action/pipeline.ts"
import type { LogExtension } from "../plugin/log.ts"
import type { RepoExtension } from "../plugin/repo.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlExtensions } from "./context.ts"
import { requireExtensions, resolveDlSetup } from "./context.ts"

export async function processRepoContext(
	resolved: RepoContext,
	ctx: DlContext,
	handlers: readonly ActionHandler[],
): Promise<boolean> {
	return runPipeline(
		resolved,
		ctx,
		handlers,
		ctx.options.reportLifecycle,
		ctx.log,
	)
}

export function createProcessEntry(
	handlers: readonly ActionHandler[],
	repoExtension: RepoExtension,
	roots: DlContext["roots"],
	options: DlOptions,
	log: LogExtension,
): (input: string) => Promise<boolean> {
	return async (input: string) => {
		try {
			const ctx: DlContext = { roots, options, log }
			let hadError = false
			let found = false
			for await (const resolved of repoExtension.resolve(input)) {
				found = true
				hadError = (await processRepoContext(resolved, ctx, handlers)) || hadError
			}
			if (!found) {
				log.warn("sync", "no_match", { input })
			}
			return hadError
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			log.error("sync", "failed", { message })
			return true
		}
	}
}

export function buildBaseOptions(values: Record<string, unknown>): DlOptions {
	return {
		consumeDexportOutput: !!values["consume-dexport-output"],
		noLogCache: !!values["no-log-cache"],
		reportLifecycle: !!values["report-lifecycle"],
		archiveState: OFF,
		wikiState: OFF,
		deepwikiState: OFF,
		archlistState: OFF,
		symlinkState: OFF,
		anycase: false,
		expand: false,
		dryRun: !!values["dry-run"],
	}
}

export async function processEntries(
	extensions: DlExtensions,
	options: DlOptions,
	inputs: readonly string[],
): Promise<boolean> {
	const setup = await resolveDlSetup(extensions, options)
	const handlers = setup.actions["dl:handlers"]
	const processEntry = createProcessEntry(
		handlers,
		setup.repo,
		setup.roots,
		options,
		setup.log,
	)
	let hadError = false
	for (const input of inputs) {
		hadError = (await processEntry(input)) || hadError
	}
	return hadError
}

export function buildSubcommandOptions(
	extensions: DlExtensions,
	values: Record<string, unknown>,
	explicit: Record<string, boolean | undefined>,
	tokens: readonly DlActionToken[],
	primarySpec: DlActionSpec,
	stateValue: unknown,
): DlOptions {
	const ext = requireExtensions(extensions)
	const stateOptionKey = `${primarySpec.name}-state`
	const stateExplicit = explicit.state === true

	const adjustedExplicit: Record<string, boolean | undefined> = {
		...explicit,
		[primarySpec.name]: explicit[primarySpec.name] ?? true,
	}

	const adjustedValues = { ...values }
	if (stateExplicit) {
		adjustedValues[stateOptionKey] = stateValue
		adjustedExplicit[stateOptionKey] = true
	}

	const base = buildBaseOptions(values)
	const actionOptions = ext.actions.resolveActionOptions(adjustedValues, adjustedExplicit, tokens)

	return {
		...base,
		archiveState: actionOptions.archiveState ?? base.archiveState,
		wikiState: actionOptions.wikiState ?? base.wikiState,
		deepwikiState: actionOptions.deepwikiState ?? base.deepwikiState,
		archlistState: actionOptions.archlistState ?? base.archlistState,
		symlinkState: actionOptions.symlinkState ?? base.symlinkState,
	}
}
