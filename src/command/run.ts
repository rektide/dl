/**
 * @module command/run
 *
 * Shared processing entry points for the dl command and its subcommands.
 *
 * The pipeline flows through these stages:
 *
 *   input strings → flow plugin → action handlers → lifecycle report
 *
 * Two read-only consumers of the flow plugin:
 * - {@link processCandidates} logs candidate (pre-verification) events
 * - {@link processVerified} logs resolved (post-verification) events
 *
 * Input sources ({@link positionalSource}, {@link watchSource}, {@link clipboardSource})
 * are defined in {@link command/input} and produce the async iterables consumed here.
 *
 * Option building:
 * - {@link buildBaseOptions} constructs `DlOptions` with all actions off.
 * - {@link buildMainOptions} resolves all action states via the plugin system.
 * - {@link buildSubcommandOptions} layers the plugin system with a `--state` alias.
 */

import { OFF } from "../action/state.ts";
import type { DlOptions, DlContext } from "../action/types.ts";
import type { ActionHandler } from "../action/handler.ts";
import type { DlActionSpec, DlActionToken } from "../action/registry.ts";
import { runPipeline } from "../action/pipeline.ts";
import { FLOW_PLUGIN_ID } from "../plugin/flow.ts";
import type { RepoContext } from "../repo/context.ts";
import type { DlExtensions } from "./context.ts";
import { requireExtensions } from "./context.ts";

async function* singleInput(input: string): AsyncGenerator<string> {
  yield input;
}

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
  return runPipeline(resolved, ctx, handlers, ctx.options.reportLifecycle, ctx.log);
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
    verified: false,
    dryRun: !!values["dry-run"],
  };
}

/**
 * Build `DlOptions` for the main dl command using the full action plugin system.
 *
 * Resolves all action states through `ext.actions.resolveActionOptions`, then
 * layers on dl-main-specific flags (anycase, verified).
 */
export function buildMainOptions(
  extensions: DlExtensions,
  values: Record<string, unknown>,
  explicit: Record<string, boolean | undefined>,
  tokens: readonly DlActionToken[],
): DlOptions {
  const ext = requireExtensions(extensions);
  const actionOptions = ext.actions.resolveActionOptions(values, explicit, tokens);

  return {
    ...buildBaseOptions(values),
    archiveState: actionOptions.archiveState ?? OFF,
    wikiState: actionOptions.wikiState ?? OFF,
    deepwikiState: actionOptions.deepwikiState ?? OFF,
    archlistState: actionOptions.archlistState ?? OFF,
    symlinkState: actionOptions.symlinkState ?? OFF,
    anycase: !!values.anycase,
    verified: !!values.verified,
  };
}

/**
 * Feed an async stream through the flow plugin, logging only
 * candidate (pre-verification) events.
 *
 * This is the `--candidates` mode: expand inputs into candidate URLs and print
 * them without any network verification or syncing.
 */
export async function processCandidates(
  extensions: DlExtensions,
  inputs: AsyncIterable<string>,
  reportLifecycle = false,
): Promise<void> {
  const ext = requireExtensions(extensions);
  const flow = extensions[FLOW_PLUGIN_ID];

  for await (const input of inputs) {
    let candidateFound = false;
    const plan = flow.plan().singleton().config({ verify: false });
    plan.on("proposed", (repo) => {
      candidateFound = true;
      ext.log.info("candidates", "expanded", {
        input: repo.input,
        url: repo.url.toString(),
        org: repo.org,
        project: repo.project,
        provider: repo.producedBy,
        verified: repo.state === "verified",
      });
    });
    plan.push(singleInput(input));

    for await (const _repo of plan.execute()) {
      // consumed via on("proposed") hook
    }

    if (reportLifecycle) {
      ext.log.info("sync", "flow_lifecycle", {
        input,
        reinjections: plan.snapshot().reinjections,
      });
    }

    if (!candidateFound) {
      ext.log.warn("candidates", "no_match", { input });
    }
  }
}

/**
 * Feed an async stream through the flow plugin, logging only
 * verified (post-verification) repos.
 *
 * This is the `--verified` mode: resolve and verify inputs, then print the
 * full repo context without syncing.
 */
export async function processVerified(
  extensions: DlExtensions,
  inputs: AsyncIterable<string>,
  reportLifecycle = false,
): Promise<void> {
  const ext = requireExtensions(extensions);
  const flow = extensions[FLOW_PLUGIN_ID];

  for await (const input of inputs) {
    let resolvedFound = false;
    const plan = flow.plan().singleton().config({ verify: true });
    plan.on("verified", (repo) => {
      resolvedFound = true;
      ext.log.info("verified", "resolved", {
        input: repo.input,
        url: repo.url.toString(),
        pathname: repo.url.pathname,
        source: {
          producedBy: repo.producedBy,
          verifiedBy: Array.from(repo.verifiedBy),
        },
      });
    });
    plan.push(singleInput(input));

    for await (const _repo of plan.execute()) {
      // consumed via on("verified") hook
    }

    if (reportLifecycle) {
      ext.log.info("sync", "flow_lifecycle", {
        input,
        reinjections: plan.snapshot().reinjections,
      });
    }

    if (!resolvedFound) {
      ext.log.warn("sync", "no_match", { input });
    }
  }
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
  const ext = requireExtensions(extensions);
  const stateOptionKey = `${primarySpec.name}-state`;
  const stateExplicit = explicit.state === true;

  const adjustedExplicit: Record<string, boolean | undefined> = {
    ...explicit,
    [primarySpec.name]: explicit[primarySpec.name] ?? true,
  };

  const adjustedValues = { ...values };
  if (stateExplicit) {
    adjustedValues[stateOptionKey] = stateValue;
    adjustedExplicit[stateOptionKey] = true;
  }

  const base = buildBaseOptions(values);
  const actionOptions = ext.actions.resolveActionOptions(adjustedValues, adjustedExplicit, tokens);

  return {
    ...base,
    archiveState: actionOptions.archiveState ?? base.archiveState,
    wikiState: actionOptions.wikiState ?? base.wikiState,
    deepwikiState: actionOptions.deepwikiState ?? base.deepwikiState,
    archlistState: actionOptions.archlistState ?? base.archlistState,
    symlinkState: actionOptions.symlinkState ?? base.symlinkState,
  };
}
