/**
 * @module command/run
 *
 * Shared processing entry points for the dl command and its subcommands.
 *
 * The pipeline flows through these stages:
 *
 *   input strings → flow plugin → action handlers → lifecycle report
 *
 * Candidate logging, verified logging, and sync actions attach to one flow plan
 * through {@link runFlowCommand}.
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
import type { LifecycleRecord } from "../action/lifecycle.ts";
import type { Repo } from "../flow/types.ts";
import { FLOW_PLUGIN_ID, type FlowReinjection } from "../plugin/flow.ts";
import type { RepoContext } from "../repo/context.ts";
import type { DlExtensions } from "./context.ts";
import { requireExtensions, resolveDlSetup } from "./context.ts";

function toLegacyRepoContext(repo: Repo): RepoContext {
  const url = new URL(repo.url.toString());
  const context: RepoContext = {
    input: repo.input,
    host: repo.host ?? undefined,
    org: repo.org ?? undefined,
    project: repo.project ?? undefined,
    verified: repo.state === "verified",
    source: { provider: repo.producedBy },
    url,
    inputUrl: repo.inputUrl ? new URL(repo.inputUrl.toString()) : undefined,
  };

  // Transitional parity for wiki handler behavior from host providers.
  if (url.host === "github.com" || url.host === "gitlab.com") {
    context.wikiRepoUrl = new URL(`${url.toString()}.wiki.git`);
  }

  return context;
}

function flowLifecycleRecords(
  repo: Repo,
  reinjections: ReadonlyArray<FlowReinjection>,
): Array<LifecycleRecord> {
  return reinjections
    .filter((reinjection) => reinjection.toInput === repo.input)
    .map((reinjection) => ({
      step: "flow",
      source: `${reinjection.fromProvider} -> flow.push`,
      status: "ok",
      transition: "redirect-reinject",
      details: {
        fromInput: reinjection.fromInput,
        fromUrl: reinjection.fromUrl,
        toInput: reinjection.toInput,
        toHost: reinjection.toHost,
      },
    }));
}

function logCandidate(repo: Repo, ext: ReturnType<typeof requireExtensions>): void {
  ext.log.info("candidates", "expanded", {
    input: repo.input,
    url: repo.url.toString(),
    org: repo.org,
    project: repo.project,
    provider: repo.producedBy,
    verified: repo.state === "verified",
  });
}

function logVerified(repo: Repo, ext: ReturnType<typeof requireExtensions>): void {
  ext.log.info("verified", "resolved", {
    input: repo.input,
    url: repo.url.toString(),
    pathname: repo.url.pathname,
    source: {
      producedBy: repo.producedBy,
      verifiedBy: Array.from(repo.verifiedBy),
    },
  });
}

export type FlowCommandRunOptions = Readonly<{
  extensions: DlExtensions;
  options: DlOptions;
  inputs: AsyncIterable<string>;
  showCandidates?: boolean;
  showVerified?: boolean;
  runActions?: boolean;
}>;

export type FlowCommandRunResult = Readonly<{
  hadError: boolean;
  candidateFound: boolean;
  verifiedFound: boolean;
}>;

export async function runFlowCommand(
  runOptions: FlowCommandRunOptions,
): Promise<FlowCommandRunResult> {
  const {
    extensions,
    options,
    inputs,
    showCandidates = false,
    showVerified = false,
    runActions = false,
  } = runOptions;
  const ext = requireExtensions(extensions);
  const flow = extensions[FLOW_PLUGIN_ID];
  const setup = runActions ? await resolveDlSetup(extensions, options) : null;
  const actionContext: DlContext | null = setup
    ? {
        roots: setup.roots,
        options,
        log: setup.log,
      }
    : null;
  const actionTasks: Array<Promise<boolean>> = [];
  let candidateFound = false;
  let verifiedFound = false;

  const plan = flow
    .plan()
    .singleton()
    .config({ verify: showVerified || runActions });

  if (showCandidates) {
    plan.on("proposed", (repo) => {
      candidateFound = true;
      logCandidate(repo, ext);
    });
  }

  if (showVerified) {
    plan.on("verified", (repo) => {
      verifiedFound = true;
      logVerified(repo, ext);
    });
  }

  if (setup && actionContext) {
    plan.on("verified", (repo) => {
      verifiedFound = true;
      const resolved = toLegacyRepoContext(repo);
      const flowRecords = flowLifecycleRecords(repo, plan.snapshot().reinjections);
      const task = runPipeline(
        resolved,
        actionContext,
        setup.actions["dl:handlers"],
        actionContext.options.reportLifecycle,
        actionContext.log,
        flowRecords,
      );
      actionTasks.push(task);
      return task.then(() => undefined);
    });
  }

  plan.push(inputs);
  for await (const _repo of plan.execute()) {
    // work is attached through checkpoint observers
  }

  if (options.reportLifecycle) {
    ext.log.info("sync", "flow_lifecycle", {
      reinjections: plan.snapshot().reinjections,
    });
  }

  const actionResults = await Promise.all(actionTasks);
  return {
    hadError: actionResults.some(Boolean),
    candidateFound,
    verifiedFound,
  };
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
