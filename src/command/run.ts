/**
 * @module command/run
 *
 * Shared processing entry points for the dl command and its subcommands.
 *
 * The pipeline flows through these stages:
 *
 *   input strings → resolve-stream plugin → action handlers → lifecycle report
 *
 * Two paths exist:
 *
 * 1. **Stream path** (preferred): {@link processEntries} accepts an `AsyncIterable<string>`
 *    and feeds it through the resolve-stream plugin, which yields candidate and resolved
 *    events. Only resolved events are piped into the action pipeline.
 *
 * 2. **Legacy entry path**: {@link createProcessEntry} returns a per-input callback that
 *    calls `repo.resolve()` directly. Kept for watch/clipboard which need a long-lived
 *    processor. Will be replaced once the input source abstraction (option B) lands.
 *
 * Option building:
 * - {@link buildBaseOptions} constructs `DlOptions` with all actions off.
 * - {@link buildSubcommandOptions} layers the action plugin system on top, mapping
 *   `--state` to the subcommand's primary action spec and passing through sibling
 *   action flags (e.g. `--deepwiki=ensure` on `rekon dl archive`).
 */

import { OFF } from "../action/state.ts"
import type { DlOptions, DlContext } from "../action/types.ts"
import type { ActionHandler } from "../action/handler.ts"
import type { DlActionSpec, DlActionToken } from "../action/registry.ts"
import { runPipeline } from "../action/pipeline.ts"
import type { LogExtension } from "../plugin/log.ts"
import type { RepoExtension } from "../plugin/repo.ts"
import { RESOLVE_STREAM_PLUGIN_ID, type ResolveStreamExtension } from "../plugin/resolve-stream.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlExtensions } from "./context.ts"
import { requireExtensions, resolveDlSetup } from "./context.ts"

/**
 * Run the action pipeline against a single resolved repo context.
 *
 * Delegates to {@link runPipeline} with lifecycle reporting configured from
 * `ctx.options`. Returns `true` if any handler reported an error.
 */
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

/**
 * Create a per-input processing callback for long-lived input sources.
 *
 * The returned function resolves an input string through `repoExtension.resolve()`,
 * then feeds each resolved {@link RepoContext} through the action pipeline via
 * {@link processRepoContext}.
 *
 * Used by watch and clipboard modes which need a stable callback to hand off
 * to their event loops.
 */
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

/**
 * Build `DlOptions` with all action states set to {@link OFF}.
 *
 * Reads shared flags (dry-run, log/cache, etc.) from raw gunshi values.
 * Action states default to off; callers layer specific states on top via
 * {@link buildSubcommandOptions} or the action plugin system.
 */
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

/**
 * Feed an async stream of input strings through the resolve-stream plugin and
 * action pipeline.
 *
 * This is the primary processing path. Each input is resolved by the
 * resolve-stream plugin, which yields both candidate and verified events.
 * Only resolved events are piped into the action handlers.
 *
 * Returns `true` if any handler reported an error.
 */
export async function processEntries(
	extensions: DlExtensions,
	options: DlOptions,
	inputs: AsyncIterable<string>,
): Promise<boolean> {
	const setup = await resolveDlSetup(extensions, options)
	const handlers = setup.actions["dl:handlers"]
	const ctx: DlContext = { roots: setup.roots, options, log: setup.log }
	const stream = extensions[RESOLVE_STREAM_PLUGIN_ID] as ResolveStreamExtension

	let hadError = false
	for await (const event of stream.resolveStream(inputs)) {
		if (event.type === "resolved") {
			hadError = (await processRepoContext(event.context, ctx, handlers)) || hadError
		}
	}
	return hadError
}

/**
 * Build `DlOptions` for an action subcommand, bridging the `--state` alias
 * with the action plugin flag system.
 *
 * Maps the subcommand's `--state` value to the primary action's `<name>-state`
 * option key, then resolves all action states through
 * `ext.actions.resolveActionOptions`. This means sibling action flags work
 * on subcommands: `rekon dl archive --deepwiki=ensure` enables both archive
 * (via the subcommand) and deepwiki (via the global flag).
 *
 * @param extensions - Gunshi plugin extensions from the command context
 * @param values - Raw parsed arg values from gunshi
 * @param explicit - Which args were explicitly provided (from `ctx.explicit`)
 * @param tokens - Raw arg tokens (from `ctx.tokens`) for inline value parsing
 * @param primarySpec - The action spec for this subcommand's primary action
 * @param stateValue - The value of `--state` (if provided)
 */
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
